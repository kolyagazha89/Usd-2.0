import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MediaTargetType } from '../generated/prisma/enums';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

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
    return { endpoint: endpoint.replace(/\\/$/, ''), region, bucket, accessKey, secretKey };
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
    const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\\.\\d{3}Z$/, 'Z');
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
    const canonicalHeaders = `content-type:${contentType}\\nhost:${host}\\n`;
    const signedHeaders = 'content-type;host';
    const payloadHash = 'UNSIGNED-PAYLOAD';
    const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\\n');
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\\n');
    const signature = crypto.createHmac('sha256', this.signingKey(cfg.secretKey, date, cfg.region, service)).update(stringToSign).digest('hex');
    params['X-Amz-Signature'] = signature;
    const baseUrl = new URL(cfg.endpoint);
    baseUrl.host = host;
    baseUrl.pathname = canonicalUri;
    baseUrl.search = Object.keys(params).sort().map((k) => `${this.awsEncode(k)}=${this.awsEncode(params[k])}`).join('&');
    return baseUrl.toString();
  }

  private publicUrl(key: string) {
    const cfg = this.config();
    const base = process.env.S3_PUBLIC_BASE_URL?.replace(/\\/$/, '');
    if (base) return `${base}/${key.split('/').map((p) => encodeURIComponent(p)).join('/')}`;
    const url = new URL(cfg.endpoint);
    if (process.env.S3_FORCE_PATH_STYLE === 'true') {
      url.pathname = `/${cfg.bucket}/${key.split('/').map((p) => encodeURIComponent(p)).join('/')}`;
    } else {
      url.host = `${cfg.bucket}.${url.host}`;
      url.pathname = `/${key.split('/').map((p) => encodeURIComponent(p)).join('/')}`;
    }
    return url.toString();
  }

  private async ensureTargetAccess(userId: string, role: string, targetType: MediaTargetType, targetId: string) {
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
    if (!ALLOWED_TYPES.has(contentType.toLowerCase())) throw new BadRequestException('Разрешены только JPG, PNG и WebP');
    await this.ensureTargetAccess(userId, role, targetType, targetId);
    const token = crypto.randomBytes(32).toString('hex');
    const key = `usd/${targetType === MediaTargetType.PARTICIPANT_PHOTO ? 'participants' : 'cars'}/${targetId}/${crypto.randomUUID()}`;
    const expiresIn = Math.min(Math.max(Number(process.env.S3_UPLOAD_EXPIRES_SECONDS ?? 600), 60), 900);
    await this.prisma.mediaUpload.create({ data: { userId, targetType, targetId, objectKey: key, contentType: contentType.toLowerCase(), tokenHash: this.hashToken(token), expiresAt: new Date(Date.now() + expiresIn * 1000) } });
    return { uploadToken: token, uploadUrl: this.presignedUrl('PUT', key, contentType.toLowerCase(), expiresIn), publicUrl: this.publicUrl(key), expiresIn, maxBytes: MAX_IMAGE_BYTES, contentType: contentType.toLowerCase() };
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

  async complete(userId: string, role: string, uploadToken: string) {
    const upload = await this.prisma.mediaUpload.findUnique({ where: { tokenHash: this.hashToken(uploadToken) } });
    if (!upload || upload.userId !== userId && role !== 'ADMIN' || upload.completedAt || upload.expiresAt < new Date()) throw new BadRequestException('Недействительная загрузка');
    await this.ensureTargetAccess(userId, role, upload.targetType, upload.targetId);
    const object = await this.headObject(upload.objectKey);
    if (!Number.isFinite(object.size) || object.size <= 0 || object.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Размер изображения должен быть от 1 байта до 10 MB');
    }
    if (object.contentType !== upload.contentType) {
      throw new BadRequestException('Тип загруженного файла не совпадает с заявленным');
    }
    await this.prisma.mediaUpload.update({ where: { id: upload.id }, data: { completedAt: new Date() } });
    const url = this.publicUrl(upload.objectKey);
    if (upload.targetType === MediaTargetType.PARTICIPANT_PHOTO) {
      await this.prisma.participant.update({ where: { id: upload.targetId }, data: { photoUrl: url } });
    } else {
      await this.prisma.car.update({ where: { id: upload.targetId }, data: { photoUrl: url } });
    }
    return { success: true, photoUrl: url };
  }
}
