import {
  BadRequestException,
  Injectable,
  Logger,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

@Injectable()
export class GoogleService {
  private readonly oauthTokenUrl = 'https://oauth2.googleapis.com/token';
  private readonly driveUrl = 'https://www.googleapis.com/drive/v3/files';
  private readonly sheetsUrl = 'https://sheets.googleapis.com/v4/spreadsheets';

  private readonly logger = new Logger(GoogleService.name);

  constructor(private readonly prisma: PrismaService) {}

  private config() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
    const encryptionKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    if (!clientId || !clientSecret || !redirectUri || !encryptionKey) {
      throw new InternalServerErrorException('Google OAuth не настроен');
    }
    if (!/^[0-9a-fA-F]{64}$/.test(encryptionKey)) {
      throw new InternalServerErrorException('GOOGLE_TOKEN_ENCRYPTION_KEY должен содержать 32 байта в hex');
    }
    return { clientId, clientSecret, redirectUri, encryptionKey: Buffer.from(encryptionKey, 'hex') };
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private encrypt(value: string) {
    const key = this.config().encryptionKey;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(':');
  }

  private decrypt(value: string) {
    const [ivHex, tagHex, dataHex] = value.split(':');
    if (!ivHex || !tagHex || !dataHex) throw new UnauthorizedException('Повреждённый Google token');
    const key = this.config().encryptionKey;
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  }

  async getStatus() {
    const connection = await this.prisma.googleConnection.findUnique({ where: { id: 'default' } });
    return {
      connected: !!connection,
      email: connection?.email ?? null,
      connectedAt: connection?.connectedAt ?? null,
    };
  }

  async createAuthorizationUrl(userId: string) {
    const { clientId, redirectUri } = this.config();
    const rawState = randomBytes(32).toString('hex');
    await this.prisma.googleOAuthState.create({
      data: {
        stateHash: this.hash(rawState),
        userId,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      scope: [
        'openid',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/gmail.send',
      ].join(' '),
      state: rawState,
    });
    return 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
  }

  async completeAuthorization(code: string, state: string) {
    if (!code || !state) throw new BadRequestException('Некорректный OAuth callback');
    const stateRow = await this.prisma.googleOAuthState.findUnique({ where: { stateHash: this.hash(state) } });
    if (!stateRow || stateRow.usedAt || stateRow.expiresAt < new Date()) {
      throw new UnauthorizedException('OAuth state недействителен или истёк');
    }

    const { clientId, clientSecret, redirectUri } = this.config();
    const tokenResponse = await fetch(this.oauthTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenResponse.ok) throw new UnauthorizedException('Google не выдал токен');
    const token = (await tokenResponse.json()) as GoogleTokenResponse;
    if (!token.refresh_token) throw new UnauthorizedException('Google не выдал refresh token');

    const access = await this.fetchWithToken(token.access_token, 'https://openidconnect.googleapis.com/v1/userinfo');
    const email = String(access.email ?? '').toLowerCase();
    if (!email) throw new UnauthorizedException('Не удалось определить Google email');

    await this.prisma.$transaction([
      this.prisma.googleConnection.upsert({
        where: { id: 'default' },
        create: {
          id: 'default',
          email,
          refreshTokenEncrypted: this.encrypt(token.refresh_token),
          connectedByUserId: stateRow.userId,
        },
        update: {
          email,
          refreshTokenEncrypted: this.encrypt(token.refresh_token),
          connectedByUserId: stateRow.userId,
          connectedAt: new Date(),
        },
      }),
      this.prisma.googleOAuthState.update({
        where: { id: stateRow.id },
        data: { usedAt: new Date() },
      }),
    ]);
  }

  private async accessToken() {
    const connection = await this.prisma.googleConnection.findUnique({ where: { id: 'default' } });
    if (!connection) throw new UnauthorizedException('Google аккаунт не подключён');
    const { clientId, clientSecret } = this.config();
    const refreshToken = this.decrypt(connection.refreshTokenEncrypted);
    const response = await fetch(this.oauthTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!response.ok) throw new UnauthorizedException('Не удалось обновить Google access token');
    const token = (await response.json()) as GoogleTokenResponse;
    return token.access_token;
  }

  private async fetchWithToken(token: string, url: string, init: RequestInit = {}) {
    const response = await fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: 'Bearer ' + token },
    });
    if (!response.ok) throw new UnauthorizedException('Ошибка Google API');
    return response.json();
  }

  async sendEmail(to: string, subject: string, text: string, html: string): Promise<void> {
    const connection = await this.prisma.googleConnection.findUnique({ where: { id: 'default' } });
    if (!connection) throw new UnauthorizedException('Google аккаунт отправителя не подключён');

    const expectedSender = process.env.SMTP_USER?.trim().toLowerCase();
    if (expectedSender && connection.email.toLowerCase() !== expectedSender) {
      throw new UnauthorizedException('Подключённый Google аккаунт не совпадает с почтовым адресом отправителя. Подключите нужный Google аккаунт.');
    }

    const token = await this.accessToken();
    const boundary = 'usd-' + randomBytes(16).toString('hex');
    const encodedSubject = '=?UTF-8?B?' + Buffer.from(subject, 'utf8').toString('base64') + '?=';
    const mime = [
      'From: ' + connection.email,
      'To: ' + to,
      'Subject: ' + encodedSubject,
      'MIME-Version: 1.0',
      'Content-Type: multipart/alternative; boundary="' + boundary + '"',
      '',
      '--' + boundary,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(text, 'utf8').toString('base64'),
      '--' + boundary,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(html, 'utf8').toString('base64'),
      '--' + boundary + '--',
      '',
    ].join('\r\n');
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: Buffer.from(mime, 'utf8').toString('base64url') }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      this.logger.error('Gmail API rejected email (HTTP ' + response.status + ').');
      if (response.status === 403) {
        throw new UnauthorizedException('Google не разрешил отправку почты. Переподключите Google и подтвердите разрешение отправлять письма.');
      }
      throw new InternalServerErrorException('Google Gmail API не принял письмо (HTTP ' + response.status + ').');
    }
  }


  async listSpreadsheets() {
    const token = await this.accessToken();
    const url = this.driveUrl + '?' + new URLSearchParams({
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      pageSize: '100',
      orderBy: 'modifiedTime desc',
      fields: 'files(id,name,modifiedTime,webViewLink)',
    });
    const data = await this.fetchWithToken(token, url);
    return (data.files ?? []).map((file: any) => ({
      id: file.id,
      name: file.name,
      modifiedTime: file.modifiedTime,
      webViewLink: file.webViewLink ?? null,
    }));
  }

  async getSpreadsheet(spreadsheetId: string) {
    const token = await this.accessToken();
    const data = await this.fetchWithToken(token, this.sheetsUrl + '/' + encodeURIComponent(spreadsheetId) + '?fields=spreadsheetId,properties,sheets.properties');
    return {
      id: data.spreadsheetId,
      title: data.properties?.title ?? '',
      sheets: (data.sheets ?? []).map((sheet: any) => ({
        id: sheet.properties?.sheetId,
        title: sheet.properties?.title,
        index: sheet.properties?.index,
        rowCount: sheet.properties?.gridProperties?.rowCount,
        columnCount: sheet.properties?.gridProperties?.columnCount,
      })),
    };
  }

  async getSheetValues(spreadsheetId: string, sheet: string) {
    const token = await this.accessToken();
    // Quote sheet titles so tabs containing spaces, punctuation, or apostrophes work in A1 notation.
    const quotedSheet = `'${sheet.replace(/'/g, "''")}'`;
    const range = encodeURIComponent(quotedSheet);
    const data = await this.fetchWithToken(token, this.sheetsUrl + '/' + encodeURIComponent(spreadsheetId) + '/values/' + range + '?majorDimension=ROWS');
    return {
      range: data.range,
      values: data.values ?? [],
    };
  }
}
