import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MediaTargetType } from '../generated/prisma/enums';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const isAllowedType = (type: string, targetType: MediaTargetType) =>
  ALLOWED_IMAGE_TYPES.has(type) || (targetType === MediaTargetType.SITE_ASSET && type === DOCX_TYPE);

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  private config() {
    const endpoint = process.env.S3_ENDPOINT;
    const region = process.env.S3_REGION ?? 'auto';
    const bucket = process.env.S3_BUCKET;
    const accessKey = process.env.S3_ACCESS_KEY_ID;
    const secretKey = process.env.S3_SECRET_ACCESS_KEY;
    if (!endpoint || !bucket || !accessKey || !secretKey) {
      throw new ServiceUnavailableException('S3-хранилище не настроено');
    }
    return { endpoint: endpoint.replace(/\/$/, ''), region, bucket, accessKey, secretKey };
  }

  private hashToken(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private awsEncode(value: string) {
    return encodeURIComponent(value).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  }

  private canonicalUri(endpoint: string, bucket: string, key: string) {
    const pathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';
    const base = new URL(endpoint);
    const encodedKey = key.split('/').map((part) => this.awsEncode(part)).join('/');
    if (pathStyle) return `/${this.awsEncode(bucket)}/${encodedKey}`;
    return `/${encodedKey}`;
  }

  private host(endpoint: string, bucket: string) {
    const url = new URL(endpoint);
    if (process.env.S3_FORCE_PATH_STYLE === 'true') return url.host;
    return `${bucket}.${url.host}`;
  }

  private signingKey(secret: string, date: string, region: string, service: string) {
    const kDate = crypto.createHmac('sha256', 'AWS4' + secret).update(date).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
    return crypto.createHmac('sha256', kService).update('aws4_request').digest();
  }

  private presignedUrl(method: string, key: string, contentType: string | null, expiresIn: number) {
    const cfg = this.config();
    const service = 's3';
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const date = amzDate.slice(0, 8);
    const credentialScope = `${date}/${cfg.region}/${service}/aws4_request`;
    const host = this.host(cfg.endpoint, cfg.bucket);
    const canonicalUri = this.canonicalUri(cfg.endpoint, cfg.bucket, key);
    const params: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${cfg.accessKey}/${credentialScope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expiresIn),
      'X-Amz-SignedHeaders': contentType ? 'content-type;host' : 'host',
    };
    const canonicalQuery = Object.keys(params).sort().map((k) => `${this.awsEncode(k)}=${this.awsEncode(params[k])}`).join('&');
    const canonicalHeaders = contentType
      ? `content-type:${contentType}\nhost:${host}\n`
      : `host:${host}\n`;
    const signedHeaders = contentType ? 'content-type;host' : 'host';
    const payloadHash = 'UNSIGNED-PAYLOAD';
    const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
    const signature = crypto.createHmac('sha256', this.signingKey(cfg.secretKey, date, cfg.region, service)).update(stringToSign).digest('hex');
    params['X-Amz-Signature'] = signature;
    const baseUrl = new URL(cfg.endpoint);
    baseUrl.host = host;
    baseUrl.pathname = canonicalUri;
    baseUrl.search = Object.keys(params).sort().map((k) => `${this.awsEncode(k)}=${this.awsEncode(params[k])}`).join('&');
    return baseUrl.toString();
  }

  private objectUrl(key: string) {
    const cfg = this.config();
    const url = new URL(cfg.endpoint);
    const encodedKey = key.split('/').map((p) => this.awsEncode(p)).join('/');
    if (process.env.S3_FORCE_PATH_STYLE === 'true') {
      url.pathname = `/${this.awsEncode(cfg.bucket)}/${encodedKey}`;
    } else {
      url.host = `${cfg.bucket}.${url.host}`;
      url.pathname = `/${encodedKey}`;
    }
    return url.toString();
  }

  private async ensureTargetAccess(userId: string, role: string, targetType: MediaTargetType, targetId: string) {
    if (targetType === MediaTargetType.SITE_ASSET) {
      if (role !== 'ADMIN') throw new ForbiddenException('Только администратор может управлять файлами сайта');
      return;
    }
    if (role === 'ADMIN') return;
    if (targetType === MediaTargetType.PARTICIPANT_PHOTO) {
      const p = await this.prisma.participant.findFirst({ where: { id: targetId, user: { id: userId } }, select: { id: true } });
      if (!p) throw new ForbiddenException('Нет доступа к профилю');
      return;
    }
    const car = await this.prisma.car.findFirst({ where: { id: targetId, participant: { user: { id: userId } } }, select: { id: true } });
    if (!car) throw new ForbiddenException('Нет доступа к автомобилю');
  }

  async prepare(userId: string, role: string, targetType: MediaTargetType, targetId: string, contentType: string) {
    if (!isAllowedType(contentType.toLowerCase(), targetType)) throw new BadRequestException('Разрешены JPG, PNG, WebP и DOCX для регламентов сайта');
    await this.ensureTargetAccess(userId, role, targetType, targetId);
    const token = crypto.randomBytes(32).toString('hex');
    const prefix = targetType === MediaTargetType.PARTICIPANT_PHOTO ? 'participants' : targetType === MediaTargetType.CAR_PHOTO ? 'cars' : 'site';
    const key = `usd/${prefix}/${targetId}/${crypto.randomUUID()}`;
    const expiresIn = Math.min(Math.max(Number(process.env.S3_UPLOAD_EXPIRES_SECONDS ?? 600), 60), 900);
    await this.prisma.mediaUpload.create({ data: { userId, targetType, targetId, objectKey: key, contentType: contentType.toLowerCase(), tokenHash: this.hashToken(token), expiresAt: new Date(Date.now() + expiresIn * 1000) } });
    return {
      uploadToken: token,
      uploadUrl: this.presignedUrl('PUT', key, contentType.toLowerCase(), expiresIn),
      objectUrl: this.objectUrl(key),
      expiresIn,
      maxBytes: MAX_IMAGE_BYTES,
      contentType: contentType.toLowerCase(),
    };
  }

  private async headObject(key: string) {
    const url = this.presignedUrl('HEAD', key, null, 60);
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) throw new BadRequestException('Файл не найден в S3 после загрузки');
    return {
      size: Number(response.headers.get('content-length') ?? '0'),
      contentType: (response.headers.get('content-type') ?? '').split(';')[0].toLowerCase(),
    };
  }

  private async isPublishedRulesDocument(targetId: string) {
    if (!targetId.startsWith('rules-draft-')) return true;
    const row = await this.prisma.siteSettings.findUnique({ where: { id: 'default' }, select: { registration: true } });
    const registration = row?.registration as Record<string, any> | null;
    const rules = registration?.rulesDocument;
    return rules?.published?.targetId === targetId ||
      Array.isArray(rules?.publishedVersions) && rules.publishedVersions.some((revision: any) => revision?.targetId === targetId);
  }

  async getSignedPublicMediaUrl(targetType: MediaTargetType, targetId: string) {
    if (targetType !== MediaTargetType.SITE_ASSET) {
      throw new ForbiddenException('Публичная выдача разрешена только для файлов сайта');
    }
    if (!(await this.isPublishedRulesDocument(targetId))) throw new ForbiddenException('Регламент ещё не опубликован');
    const upload = await this.prisma.mediaUpload.findFirst({
      where: { targetType, targetId, completedAt: { not: null } },
      orderBy: { completedAt: 'desc' },
      select: { objectKey: true, contentType: true },
    });
    if (!upload) throw new BadRequestException('Файл не найден');
    const expiresIn = Math.min(Math.max(Number(process.env.S3_VIEW_EXPIRES_SECONDS ?? 300), 30), 900);
    return { success: true, url: this.presignedUrl('GET', upload.objectKey, null, expiresIn), expiresIn, contentType: upload.contentType };
  }

  async getPublicMediaFile(targetType: MediaTargetType, targetId: string) {
    if (targetType !== MediaTargetType.SITE_ASSET) {
      throw new ForbiddenException('Публичная выдача разрешена только для файлов сайта');
    }
    if (!(await this.isPublishedRulesDocument(targetId))) throw new ForbiddenException('Регламент ещё не опубликован');
    const upload = await this.prisma.mediaUpload.findFirst({
      where: { targetType, targetId, completedAt: { not: null } },
      orderBy: { completedAt: 'desc' },
      select: { objectKey: true, contentType: true },
    });
    if (!upload) throw new BadRequestException('Файл не найден');
    const response = await fetch(this.presignedUrl('GET', upload.objectKey, null, 60));
    if (!response.ok) throw new BadRequestException('Не удалось получить файл из хранилища');
    const body = Buffer.from(await response.arrayBuffer());
    if (!body.length) throw new BadRequestException('Файл пустой');
    return { body, contentType: upload.contentType };
  }

  async getSignedViewUrl(userId: string, role: string, targetType: MediaTargetType, targetId: string) {
    await this.ensureTargetAccess(userId, role, targetType, targetId);

    const upload = await this.prisma.mediaUpload.findFirst({
      where: {
        targetType,
        targetId,
        completedAt: { not: null },
      },
      orderBy: { completedAt: 'desc' },
      select: { objectKey: true, contentType: true },
    });

    if (!upload) {
      throw new BadRequestException('Фотография не найдена');
    }

    const expiresIn = Math.min(
      Math.max(Number(process.env.S3_VIEW_EXPIRES_SECONDS ?? 300), 30),
      900,
    );

    return {
      success: true,
      url: this.presignedUrl('GET', upload.objectKey, null, expiresIn),
      expiresIn,
      contentType: upload.contentType,
    };
  }

  private async validateImageSignature(key: string, contentType: string) {
    const response = await fetch(this.presignedUrl('GET', key, null, 60));
    if (!response.ok) {
      throw new BadRequestException('Не удалось проверить загруженное изображение');
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const isJpeg =
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff;
    const isPng =
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a;
    const isWebp =
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50;

    const valid =
      (contentType === 'image/jpeg' && isJpeg) ||
      (contentType === 'image/png' && isPng) ||
      (contentType === 'image/webp' && isWebp);

    if (!valid) {
      throw new BadRequestException('Содержимое файла не соответствует заявленному типу изображения');
    }
  }

  private async validateDocxSignature(key: string) {
    const response = await fetch(this.presignedUrl('GET', key, null, 60));
    if (!response.ok) throw new BadRequestException('Не удалось проверить загруженный DOCX');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
      throw new BadRequestException('Файл не является корректным DOCX');
    }
  }

  private async getReferencedSiteAssetIds(): Promise<Set<string>> {
    const settings = await this.prisma.siteSettings.findUnique({ where: { id: 'default' } });
    const referenced = new Set<string>();
    const scan = (value: unknown, key = '') => {
      if (typeof value === 'string') {
        if (key === 'targetId' && value.trim()) referenced.add(value.trim());
        const marker = '/media/public-file/SITE_ASSET/';
        const index = value.indexOf(marker);
        if (index >= 0) {
          const raw = value.slice(index + marker.length).split(/[?#/]/, 1)[0];
          if (raw) {
            try { referenced.add(decodeURIComponent(raw)); } catch { referenced.add(raw); }
          }
        }
        return;
      }
      if (Array.isArray(value)) {
        for (const item of value) scan(item);
        return;
      }
      if (value && typeof value === 'object') {
        for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) scan(childValue, childKey);
      }
    };
    scan(settings);
    return referenced;
  }

  async listMediaLibrary(role: string) {
    if (role !== 'ADMIN') throw new ForbiddenException('Медиатека доступна только администратору');
    const uploads = await this.prisma.mediaUpload.findMany({
      where: { completedAt: { not: null } },
      orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, targetType: true, targetId: true, contentType: true, completedAt: true, createdAt: true, objectKey: true },
    });
    const seen = new Set<string>();
    const latest = uploads.filter((upload) => {
      const key = upload.targetType + ':' + upload.targetId;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const referenced = await this.getReferencedSiteAssetIds();
    const expiresIn = Math.min(Math.max(Number(process.env.S3_VIEW_EXPIRES_SECONDS ?? 300), 30), 900);
    return {
      success: true,
      items: latest.map((upload) => ({
        id: upload.id,
        targetType: upload.targetType,
        targetId: upload.targetId,
        contentType: upload.contentType,
        completedAt: upload.completedAt,
        createdAt: upload.createdAt,
        previewUrl: this.presignedUrl('GET', upload.objectKey, null, expiresIn),
        isReferenced: upload.targetType === MediaTargetType.SITE_ASSET
          ? referenced.has(upload.targetId)
          : true,
        canDelete: upload.targetType !== MediaTargetType.SITE_ASSET || !referenced.has(upload.targetId),
      })),
    };
  }

  async deleteMediaAsset(userId: string, role: string, targetType: MediaTargetType, targetId: string) {
    if (role !== 'ADMIN') throw new ForbiddenException('Медиатека доступна только администратору');
    if (!Object.values(MediaTargetType).includes(targetType)) throw new BadRequestException('Неизвестный тип медиа');
    const normalizedTargetId = targetId.trim();
    if (!normalizedTargetId || normalizedTargetId.length > 200) throw new BadRequestException('Некорректный идентификатор медиа');
    const uploads = await this.prisma.mediaUpload.findMany({
      where: { targetType, targetId: normalizedTargetId, completedAt: { not: null } },
      orderBy: [{ completedAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, objectKey: true, contentType: true },
    });
    if (!uploads.length) throw new NotFoundException('Медиафайл не найден');

    if (targetType === MediaTargetType.SITE_ASSET) {
      const referenced = await this.getReferencedSiteAssetIds();
      if (referenced.has(normalizedTargetId)) {
        throw new ConflictException('Файл используется на сайте. Сначала замените его или уберите ссылку в соответствующем разделе.');
      }
    }

    // Remove database references first. If object-store cleanup later fails,
    // the asset is already detached from the public site/profile and can be retried safely.
    await this.prisma.$transaction(async (tx) => {
      if (targetType === MediaTargetType.PARTICIPANT_PHOTO) {
        await tx.participant.updateMany({ where: { id: normalizedTargetId }, data: { photoUrl: null } });
      } else if (targetType === MediaTargetType.CAR_PHOTO) {
        await tx.car.updateMany({ where: { id: normalizedTargetId }, data: { photoUrl: null } });
      }
      await tx.mediaUpload.deleteMany({ where: { targetType, targetId: normalizedTargetId, completedAt: { not: null } } });
    });

    let storageCleanupPending = false;
    for (const upload of uploads) {
      try {
        const response = await fetch(this.presignedUrl('DELETE', upload.objectKey, null, 60), { method: 'DELETE' });
        if (!response.ok && response.status !== 404) storageCleanupPending = true;
      } catch {
        storageCleanupPending = true;
      }
    }
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'MEDIA_ASSET_DELETED',
          entity: 'MediaUpload',
          entityId: normalizedTargetId,
          metadata: { targetType, versionsDeleted: uploads.length, storageCleanupPending, objectKeys: storageCleanupPending ? uploads.map((upload) => upload.objectKey) : [] },
        },
      });
    } catch {
      // Media deletion should remain successful if audit storage is temporarily unavailable.
    }
    return { success: true, targetType, targetId: normalizedTargetId, deletedVersions: uploads.length, storageCleanupPending };
  }

  async getSiteAssetBuffer(targetId: string) {
    const upload = await this.prisma.mediaUpload.findFirst({
      where: { targetType: MediaTargetType.SITE_ASSET, targetId, contentType: DOCX_TYPE, completedAt: { not: null } },
      orderBy: { completedAt: 'desc' },
      select: { objectKey: true },
    });
    if (!upload) throw new BadRequestException('Загруженный документ не найден');
    const response = await fetch(this.presignedUrl('GET', upload.objectKey, null, 60));
    if (!response.ok) throw new BadRequestException('Не удалось получить DOCX из хранилища');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new BadRequestException('Некорректный размер DOCX');
    return bytes;
  }

  async uploadThroughApi(userId: string, role: string, uploadToken: string, body: Buffer, contentType: string) {
    if (!Buffer.isBuffer(body) || body.length <= 0 || body.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Размер файла должен быть от 1 байта до 10 MB');
    }
    const upload = await this.prisma.mediaUpload.findUnique({
      where: { tokenHash: this.hashToken(uploadToken) },
    });
    if (!upload || (upload.userId !== userId && role !== 'ADMIN') || upload.completedAt || upload.expiresAt < new Date()) {
      throw new BadRequestException('Недействительная загрузка');
    }
    await this.ensureTargetAccess(userId, role, upload.targetType, upload.targetId);
    if (upload.contentType !== contentType.toLowerCase()) {
      throw new BadRequestException('Тип загруженного файла не совпадает с заявленным');
    }
    const response = await fetch(this.presignedUrl('PUT', upload.objectKey, upload.contentType, 120), {
      method: 'PUT',
      headers: { 'Content-Type': upload.contentType },
      body: body as unknown as BodyInit,
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).trim();
      throw new BadRequestException(detail ? 'Хранилище отклонило загрузку: ' + detail.slice(0, 200) : 'Хранилище отклонило загрузку файла');
    }
    return this.complete(userId, role, uploadToken);
  }

  async complete(userId: string, role: string, uploadToken: string) {
    const upload = await this.prisma.mediaUpload.findUnique({ where: { tokenHash: this.hashToken(uploadToken) } });
    if (!upload || upload.userId !== userId && role !== 'ADMIN' || upload.completedAt || upload.expiresAt < new Date()) throw new BadRequestException('Недействительная загрузка');
    await this.ensureTargetAccess(userId, role, upload.targetType, upload.targetId);
    const object = await this.headObject(upload.objectKey);
    if (!Number.isFinite(object.size) || object.size <= 0 || object.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Размер файла должен быть от 1 байта до 10 MB');
    }
    if (object.contentType !== upload.contentType) {
      throw new BadRequestException('Тип загруженного файла не совпадает с заявленным');
    }
    if (ALLOWED_IMAGE_TYPES.has(upload.contentType)) {
      await this.validateImageSignature(upload.objectKey, upload.contentType);
    } else if (upload.contentType === DOCX_TYPE && upload.targetType === MediaTargetType.SITE_ASSET) {
      await this.validateDocxSignature(upload.objectKey);
    } else {
      throw new BadRequestException('Недопустимый тип файла для этой загрузки');
    }
    await this.prisma.mediaUpload.update({ where: { id: upload.id }, data: { completedAt: new Date() } });
    // The bucket is private. Store the S3 object URL internally; clients must not
    // use it directly. A signed GET URL can be generated when media delivery is added.
    const url = this.objectUrl(upload.objectKey);
    if (upload.targetType === MediaTargetType.PARTICIPANT_PHOTO) {
      await this.prisma.participant.update({ where: { id: upload.targetId }, data: { photoUrl: url } });
    } else if (upload.targetType === MediaTargetType.CAR_PHOTO) {
      await this.prisma.car.update({ where: { id: upload.targetId }, data: { photoUrl: url } });
    }
    return { success: true, photoUrl: url, targetType: upload.targetType, targetId: upload.targetId };
  }
}
