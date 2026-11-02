import {
  BadGatewayException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';

import * as nodemailer from 'nodemailer';
import { setDefaultResultOrder } from 'node:dns';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { renderUsdMailShell } from './mail-brand-layout';

// Prefer IPv4 on домашнем сервере USD, where outbound IPv6 SMTP routes may be unavailable.
setDefaultResultOrder('ipv4first');

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] ?? char);
}

export function renderBrandedEmail(input: {
  heading: string;
  intro: string;
  actionLabel: string;
  actionUrl: string;
  note: string;
  frontendUrl: string;
  subject?: string;
  template?: Record<string, any>;
}): { html: string; text: string; subject: string } {
  const variableTexts = (input.template?.variableTexts && typeof input.template.variableTexts === 'object' ? input.template.variableTexts : {}) as Record<string, unknown>;
  const headingValue = String(variableTexts.heading ?? '').trim() || input.heading;
  const introValue = String(variableTexts.intro ?? '').trim() || input.intro;
  const detailsBefore = String(variableTexts.detailsBefore ?? '').trim();
  const detailsAfter = String(variableTexts.detailsAfter ?? '').trim();
  const detailsValue = [detailsBefore, input.note, detailsAfter].filter(Boolean).join('\n');
  const buttonValue = String(input.template?.buttonLabel || input.actionLabel);
  const bodyTemplate = String(input.template?.body || '{{intro}}\n\n{{details}}');
  const footerValue = String(input.template?.footer || 'USD · Звук. Мощность. Характер.');
  const subjectValue = String(input.template?.subject || input.subject || 'Уведомление USD')
    .replace(/\{\{heading\}\}/g, headingValue)
    .replace(/\{\{intro\}\}/g, introValue)
    .replace(/\{\{details\}\}/g, detailsValue)
    .replace(/\s+/g, ' ').trim();
  const textBody = bodyTemplate
    .replace(/\{\{heading\}\}/g, headingValue)
    .replace(/\{\{intro\}\}/g, introValue)
    .replace(/\{\{details\}\}/g, detailsValue);
  const actionUrl = escapeHtml(input.actionUrl);
  const frontendUrl = escapeHtml(input.frontendUrl);
  const bodyHtml = bodyTemplate.split(/(\{\{(?:heading|intro|details)\}\})/g).map((part) => {
    if (part === '{{heading}}') return escapeHtml(headingValue);
    if (part === '{{intro}}') return escapeHtml(introValue);
    if (part === '{{details}}') return '<div style="border-left:3px solid #ed2638;padding:10px 14px;background:#f8f8f9;color:#626269;font-size:12px;line-height:1.6">' + escapeHtml(detailsValue).replace(/\n/g, '<br>') + '</div>';
    return escapeHtml(part).replace(/\n/g, '<br>');
  }).join('');
  const text = [
    'USD · ULTIMATE SOUND DESTRUCTION',
    headingValue,
    '',
    textBody,
    '',
    buttonValue + ': ' + input.actionUrl,
    '',
    footerValue,
    '',
    'Открыть сайт: ' + input.frontendUrl,
  ].join('\n');
  const html = renderUsdMailShell({
    heading: headingValue,
    bodyHtml,
    actionUrl: input.actionUrl,
    actionLabel: buttonValue,
    frontendUrl: input.frontendUrl,
    footerHtml: escapeHtml(footerValue).replace(/\n/g, '<br>'),
    preheader: introValue,
    eyebrow: 'АККАУНТ USD · СЕРВИСНОЕ ПИСЬМО',
  });
  return { html, text, subject: subjectValue };
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  private async getEmailTemplate(trigger: string): Promise<Record<string, any> | undefined> {
    if (!this.prisma || typeof this.prisma.siteSettings?.findUnique !== 'function') return undefined;
    const row = await this.prisma.siteSettings.findUnique({ where: { id: 'default' }, select: { registration: true } }).catch(() => null);
    const registration = (row?.registration ?? {}) as Record<string, any>;
    const templates = Array.isArray(registration.emailTemplates) ? registration.emailTemplates : [];
    return templates.find((item: any) => item?.trigger === trigger && item?.enabled !== false);
  }
  private readonly transporter =
    nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      port: Number(
        process.env.SMTP_PORT ?? 465,
      ),
      // Port 465 uses implicit TLS; port 587 normally uses STARTTLS.
      secure:
        process.env.SMTP_SECURE === 'true' ||
        (process.env.SMTP_SECURE !== 'false' &&
          Number(process.env.SMTP_PORT ?? 465) === 465),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

  private readonly from =
    process.env.SMTP_FROM ??
    process.env.SMTP_USER;

  private readonly frontendUrl =
    process.env.FRONTEND_URL ??
    'http://localhost:3000';

  private async sendViaGmailApi(message: { to: string; subject: string; text: string; html: string }): Promise<void> {
    const clientId = (process.env.GMAIL_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID)?.trim();
    const clientSecret = (process.env.GMAIL_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET)?.trim();
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim();
    const sender = process.env.GMAIL_SENDER_EMAIL?.trim();

    if (!clientId || !clientSecret || !refreshToken || !sender) {
      throw new Error('Gmail API configuration is incomplete: set GMAIL_CLIENT_ID (or GOOGLE_CLIENT_ID), GMAIL_CLIENT_SECRET (or GOOGLE_CLIENT_SECRET), GMAIL_REFRESH_TOKEN and GMAIL_SENDER_EMAIL');
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!tokenResponse.ok) {
      this.logger.error(`Gmail OAuth token refresh failed (HTTP ${tokenResponse.status}).`);
      throw new Error(`Gmail OAuth token refresh failed with HTTP ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json() as { access_token?: unknown };
    if (typeof tokenData.access_token !== 'string' || !tokenData.access_token) {
      throw new Error('Gmail OAuth token response did not include an access token');
    }

    const boundary = 'usd-' + randomBytes(16).toString('hex');
    const encodedSubject = '=?UTF-8?B?' + Buffer.from(message.subject, 'utf8').toString('base64') + '?=';
    const mime = [
      'From: ' + sender,
      'To: ' + message.to,
      'Subject: ' + encodedSubject,
      'MIME-Version: 1.0',
      'Content-Type: multipart/alternative; boundary="' + boundary + '"',
      '',
      '--' + boundary,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(message.text, 'utf8').toString('base64'),
      '--' + boundary,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(message.html, 'utf8').toString('base64'),
      '--' + boundary + '--',
      '',
    ].join('\r\n');

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + tokenData.access_token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: Buffer.from(mime, 'utf8').toString('base64url') }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      this.logger.error(`Gmail API rejected email (HTTP ${response.status}).`);
      throw new Error(`Gmail API request failed with HTTP ${response.status}`);
    }

    let messageId = 'unknown';
    try {
      const result = await response.json() as { id?: unknown };
      if (typeof result.id === 'string') messageId = result.id;
    } catch {
      // Gmail may accept a message without a parseable response body.
    }
    this.logger.log(`Gmail API accepted email (id=${messageId}); inbox delivery is not confirmed by API acceptance.`);
  }

  /**
   * Explicit mail routing takes precedence over stale credentials left by the
   * previous provider. Without MAIL_PROVIDER, preserve historical selection
   * order for existing installations.
   */
  private requestedMailProvider(): '' | 'smtp' | 'gmail' | 'resend' {
    const value = (process.env.MAIL_PROVIDER ?? '').trim().toLowerCase();
    if (value && value !== 'smtp' && value !== 'gmail' && value !== 'resend') {
      throw new Error('MAIL_PROVIDER must be smtp, gmail or resend');
    }
    return value as '' | 'smtp' | 'gmail' | 'resend';
  }

  private yandexSenderMatchesAccount(): boolean {
    const host = process.env.SMTP_HOST?.trim().toLowerCase();
    if (host !== 'smtp.yandex.ru' && host !== 'smtp.yandex.com') return true;
    const login = process.env.SMTP_USER?.trim().toLowerCase() ?? '';
    const domain = host === 'smtp.yandex.com' ? 'yandex.com' : 'yandex.ru';
    const expected = login.includes('@') ? login : login ? login + '@' + domain : '';
    const from = (this.from ?? '').trim();
    const sender = (from.match(/<([^<>]+)>\s*$/)?.[1] ?? from).trim().toLowerCase();
    return Boolean(expected && sender === expected);
  }

  private async sendMessage(message: { to: string; subject: string; text: string; html: string }): Promise<void> {
    const requestedProvider = this.requestedMailProvider();
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (requestedProvider === 'resend' || (!requestedProvider && apiKey)) {
      if (!apiKey) throw new Error('RESEND_API_KEY is required when MAIL_PROVIDER=resend');
      const from = process.env.RESEND_FROM_EMAIL?.trim();
      if (!from) {
        throw new Error('RESEND_FROM_EMAIL must be configured when RESEND_API_KEY is set');
      }

      // Resend uses HTTPS (port 443), which works on домашнем сервере USD plans that block SMTP.
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        this.logger.error(`Resend API rejected email (HTTP ${response.status}).`);
        throw new Error(`Resend API request failed with HTTP ${response.status}`);
      }

      let providerResult: { id?: unknown } | null = null;
      try {
        providerResult = await response.json() as { id?: unknown };
      } catch {
        // A successful HTTP response without JSON still means the provider accepted the request.
      }
      const providerId = typeof providerResult?.id === 'string' ? providerResult.id : 'unknown';
      this.logger.log(`Resend accepted email (id=${providerId}); inbox delivery is not confirmed by API acceptance.`);
      return;
    }

    const gmailConfigured = Boolean(
      (process.env.GMAIL_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID)?.trim()
      && (process.env.GMAIL_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET)?.trim()
      && process.env.GMAIL_REFRESH_TOKEN?.trim()
      && process.env.GMAIL_SENDER_EMAIL?.trim(),
    );
    // GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET may be configured for website
    // OAuth login only. Never select Gmail delivery on those credentials alone.
    // Gmail delivery is opt-in via GMAIL_* parameters.
    const gmailPartiallyConfigured = Boolean(
      process.env.GMAIL_CLIENT_ID || process.env.GMAIL_CLIENT_SECRET
      || process.env.GMAIL_REFRESH_TOKEN || process.env.GMAIL_SENDER_EMAIL,
    );
    const smtpConfigured=Boolean(process.env.SMTP_HOST?.trim()&&process.env.SMTP_USER?.trim()
      &&process.env.SMTP_PASSWORD?.trim()&&this.from?.trim());
    if (requestedProvider === 'gmail' || (!requestedProvider && gmailConfigured)) {
      await this.sendViaGmailApi(message);
      return;
    }
    // An incomplete Gmail API setup must not hijack a previously configured
    // and working SMTP transport. Never fall back after an actual send error:
    // retrying can create duplicates at the recipient.
    if(!requestedProvider&&gmailPartiallyConfigured&&!smtpConfigured) {
      throw new Error('Gmail API email configuration is incomplete. Set GMAIL_REFRESH_TOKEN and GMAIL_SENDER_EMAIL or configure a complete SMTP/Resend provider.');
    }
    // домашнем сервере USD may block outbound SMTP. Keep the explicit opt-in, even when
    // SMTP credentials are present: avoid hanging real registration requests.
    if (process.env.SMTP_EGRESS_ALLOWED !== 'true') {
      throw new Error('SMTP delivery requires SMTP_EGRESS_ALLOWED=true on a network that supports it; otherwise configure Gmail API or Resend HTTPS.');
    }
    if (!smtpConfigured) {
      throw new Error('No complete email transport: configure Resend, Gmail API OAuth or SMTP_HOST/SMTP_USER/SMTP_PASSWORD.');
    }
    // A personal Yandex mailbox can only send with its own From address.
    // Reject misconfiguration before opening a connection or risking a bounce.
    if (!this.yandexSenderMatchesAccount()) {
      throw new Error('Yandex SMTP_FROM must match the authenticated Yandex mailbox');
    }

    const result = await this.transporter.sendMail({
      from: this.from,
      ...message,
    });
    const acceptedCount = Array.isArray(result.accepted) ? result.accepted.length : 0;
    const rejectedCount = Array.isArray(result.rejected) ? result.rejected.length : 0;
    const messageId = typeof result.messageId === 'string' ? result.messageId : 'unknown';
    if (acceptedCount === 0) {
      this.logger.error(`SMTP did not accept message (messageId=${messageId}, rejected=${rejectedCount}).`);
      throw new Error('SMTP server did not accept the recipient');
    }
    this.logger.log(`SMTP accepted email (messageId=${messageId}, accepted=${acceptedCount}, rejected=${rejectedCount}); inbox delivery is not confirmed by SMTP acceptance.`);
  }

  async sendNotificationEmail(message: { to: string; subject: string; text: string; html: string }): Promise<void> {
    await this.sendMessage(message);
  }

  async sendTestAuthTemplate(email: string, type: 'AUTH_EMAIL_VERIFICATION' | 'AUTH_PASSWORD_RESET' | 'AUTH_EMAIL_CHANGE'): Promise<{ success: true; providerAccepted: true; deliveryConfirmed: false; type: string; message: string }> {
    const configs = {
      AUTH_EMAIL_VERIFICATION: { subject: 'Подтверждение email — USD', heading: 'Подтверждение email', actionLabel: 'Подтвердить email' },
      AUTH_PASSWORD_RESET: { subject: 'Восстановление пароля — USD', heading: 'Восстановление пароля', actionLabel: 'Восстановить пароль' },
      AUTH_EMAIL_CHANGE: { subject: 'Подтверждение нового email — USD', heading: 'Подтверждение нового email', actionLabel: 'Подтвердить новый email' },
    };
    const config = configs[type];
    const template = await this.getEmailTemplate(type);
    const message = renderBrandedEmail({
      subject: config.subject,
      template,
      heading: config.heading,
      intro: 'Это тестовый экземпляр шаблона из административной панели USD. Он не подтверждает email и не изменяет пароль.',
      actionLabel: config.actionLabel,
      actionUrl: this.frontendUrl,
      note: 'Тестовая ссылка ведёт только на сайт. Настоящий токен аккаунта не создавался.',
      frontendUrl: this.frontendUrl,
    });
    await this.sendMessage({ to: email, ...message });
    return { success: true, providerAccepted: true, deliveryConfirmed: false, type, message: 'Провайдер принял тестовый запрос. Проверьте входящие и папку «Спам»; фактическая доставка не подтверждена.' };
  }

  /** Administrative, credential-safe mail channel report; never exposes secrets. */
  getDeliveryStatus(): { provider: string; ready: boolean; missing: string[]; note: string } {
    let requestedProvider: '' | 'smtp' | 'gmail' | 'resend';
    try { requestedProvider = this.requestedMailProvider(); }
    catch {
      return {provider:'MAIL_PROVIDER',ready:false,missing:['MAIL_PROVIDER=smtp|gmail|resend'],note:'Указан неизвестный почтовый провайдер; отправка заблокирована.'};
    }
    const resend=requestedProvider==='resend'||(!requestedProvider&&Boolean(process.env.RESEND_API_KEY?.trim()));
    if(resend) {
      const missing=[
        !process.env.RESEND_API_KEY?.trim()&&'RESEND_API_KEY',
        !process.env.RESEND_FROM_EMAIL?.trim()&&'RESEND_FROM_EMAIL',
      ].filter((v):v is string=>Boolean(v));
      return {provider:'Resend HTTPS',ready:missing.length===0,missing,note:missing.length?'Нужно указать подтверждённый адрес отправителя Resend.':'Настройки заданы. Для подтверждения доставки отправьте тестовое письмо.'};
    }
    const gmailRequested=Boolean(
      process.env.GMAIL_CLIENT_ID || process.env.GMAIL_CLIENT_SECRET ||
      process.env.GMAIL_REFRESH_TOKEN || process.env.GMAIL_SENDER_EMAIL
    );
    const gmailReady=Boolean(
      (process.env.GMAIL_CLIENT_ID??process.env.GOOGLE_CLIENT_ID)?.trim() &&
      (process.env.GMAIL_CLIENT_SECRET??process.env.GOOGLE_CLIENT_SECRET)?.trim() &&
      process.env.GMAIL_REFRESH_TOKEN?.trim() && process.env.GMAIL_SENDER_EMAIL?.trim()
    );
    const smtpReady=Boolean(process.env.SMTP_HOST?.trim()&&process.env.SMTP_USER?.trim()
      &&process.env.SMTP_PASSWORD?.trim()&&this.from?.trim());
    if(requestedProvider==='gmail'||(!requestedProvider&&gmailRequested&&(gmailReady||!smtpReady))) {
      const missing=[
        !((process.env.GMAIL_CLIENT_ID??process.env.GOOGLE_CLIENT_ID)?.trim())&&'GMAIL_CLIENT_ID (или GOOGLE_CLIENT_ID)',
        !((process.env.GMAIL_CLIENT_SECRET??process.env.GOOGLE_CLIENT_SECRET)?.trim())&&'GMAIL_CLIENT_SECRET (или GOOGLE_CLIENT_SECRET)',
        !process.env.GMAIL_REFRESH_TOKEN?.trim()&&'GMAIL_REFRESH_TOKEN',
        !process.env.GMAIL_SENDER_EMAIL?.trim()&&'GMAIL_SENDER_EMAIL',
      ].filter((v):v is string=>Boolean(v));
      return {provider:'Gmail API HTTPS',ready:!missing.length,missing,note:missing.length?'Gmail API настроен частично. Заполните отсутствующие параметры в окружении сервера USD.':'OAuth-настройки присутствуют; фактическую авторизацию проверит тестовое письмо.'};
    }
    const missing=[
      !process.env.SMTP_HOST?.trim()&&'SMTP_HOST',
      !process.env.SMTP_USER?.trim()&&'SMTP_USER',
      !process.env.SMTP_PASSWORD?.trim()&&'SMTP_PASSWORD',
      !this.from?.trim()&&'SMTP_FROM',
      process.env.SMTP_EGRESS_ALLOWED!=='true'&&'SMTP_EGRESS_ALLOWED=true',
      !this.yandexSenderMatchesAccount()&&'SMTP_FROM (должен совпадать с адресом Яндекс Почты)',
    ].filter((v):v is string=>Boolean(v));
    const isYandex=['smtp.yandex.com','smtp.yandex.ru'].includes(process.env.SMTP_HOST?.trim().toLowerCase()??'');
    return {provider:isYandex?'Яндекс Почта (SMTP)':'SMTP',ready:!missing.length,missing,note:(missing.length?'Для отправки настройте SMTP в окружении API и проверьте доступность порта с Ubuntu.':'SMTP-настройки присутствуют; проверьте фактическую доставку тестом в админке USD.')+(process.env.MAIL_ACCOUNT_ONLY==='true'?' Автоматические письма об этапах отключены; используйте PUSH.':'')};
  }

  /**
   * ADMIN-only mail-test boundary: never expose SMTP, OAuth or provider
   * exceptions verbatim. An incomplete server configuration is actionable
   * (503), while a rejected connection/authentication is a gateway error
   * (502). No automatic retry or transport fallback: either can duplicate
   * messages already accepted by the provider.
   */
  async runAdminMailTest<T>(send: () => Promise<T>): Promise<T> {
    let status: ReturnType<MailService['getDeliveryStatus']>;
    try {
      status = this.getDeliveryStatus();
    } catch {
      this.logger.error('Administrative email test readiness check failed.');
      throw new ServiceUnavailableException({
        code: 'MAIL_STATUS_UNAVAILABLE',
        message: 'Не удалось проверить настройки почты. Проверьте журнал API и конфигурацию почтового сервиса.',
      });
    }
    if (!status.ready) {
      this.logger.warn('Mail test blocked: incomplete server mail configuration.');
      throw new ServiceUnavailableException({
        code: 'MAIL_CONFIGURATION_INCOMPLETE',
        message: 'Почта не настроена на сервере. Проверьте: ' + status.missing.join(', ') + '.',
      });
    }
    try {
      return await send();
    } catch (error) {
      if (error instanceof HttpException) {
        // Preserve actionable 4xx validation and the already-sanitized
        // transport diagnostics. Never leak an unrelated 500 from a template
        // lookup, driver or downstream integration to the admin mail screen.
        if (error.getStatus() < 500 || error instanceof BadGatewayException ||
            error instanceof ServiceUnavailableException) throw error;
        this.logger.warn('Administrative mail test dependency returned HTTP 5xx.');
        throw new ServiceUnavailableException({
          code: 'MAIL_TEST_DEPENDENCY_FAILED',
          message: 'Тест письма не выполнен из-за ошибки сервиса шаблонов. Проверьте журнал API на Ubuntu.',
        });
      }
      const mailError = error as { code?: unknown; responseCode?: unknown } | null;
      const code = typeof mailError?.code === 'string' ? mailError.code.toUpperCase() : '';
      const responseCode = typeof mailError?.responseCode === 'number' ? mailError.responseCode : 0;
      let kind = 'MAIL_PROVIDER_REJECTED';
      let message = 'Почтовый сервер не принял тестовое письмо. Проверьте настройки Яндекс Почты и журнал API на Ubuntu.';
      if (code === 'EAUTH' || [530, 534, 535, 538].includes(responseCode)) {
        kind = 'MAIL_AUTH_FAILED';
        message = 'Яндекс Почта отклонила авторизацию. Проверьте SMTP_USER, пароль приложения SMTP_PASSWORD и разрешение почтовых программ.';
      } else if (['ECONNECTION', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH', 'EAI_AGAIN', 'ENOTFOUND', 'ESOCKET'].includes(code)) {
        kind = 'MAIL_CONNECTION_FAILED';
        message = 'Нет соединения с почтовым сервером. Проверьте SMTP_HOST, порт 465 и доступность исходящего SMTP с Ubuntu.';
      } else if (['ETLS', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT'].includes(code)) {
        kind = 'MAIL_TLS_FAILED';
        message = 'Не удалось установить защищённое TLS-соединение с SMTP. Проверьте SMTP_HOST, SMTP_PORT и SMTP_SECURE.';
      }
      // Provider errors may contain auth details, raw URLs and recipient data.
      // Only log the fixed diagnostic category and safe SMTP status code.
      this.logger.warn('Administrative email test failed: ' + kind +
        (responseCode >= 400 && responseCode <= 599 ? ', smtpStatus=' + responseCode : ''));
      throw new BadGatewayException({ code: kind, message });
    }
  }

  /**
   * ADMIN-only connection verification. No message is sent and neither SMTP
   * acceptance nor connection readiness proves an inbox delivery.
   * runAdminMailTest keeps SMTP/OAuth details and credentials out of the API.
   */
  async checkConnection(): Promise<{ success: true; connected: boolean; deliveryConfirmed: false; message: string }> {
    const provider = this.getDeliveryStatus().provider;
    return this.runAdminMailTest(async () => {
      if (!provider.includes('SMTP')) {
        return {
          success: true as const,
          connected: false,
          deliveryConfirmed: false as const,
          message: 'Для HTTPS-провайдера используйте отправку контрольного письма.',
        };
      }
      await this.transporter.verify();
      return {
        success: true as const,
        connected: true,
        deliveryConfirmed: false as const,
        message: 'SMTP-соединение и авторизация успешны. Теперь отправьте тестовое письмо и проверьте его получение.',
      };
    });
  }

  async sendTestEmail(email: string): Promise<{ success: true; providerAccepted: true; deliveryConfirmed: false; message: string }> {
    const sentAt = new Date().toISOString();
    const message = renderBrandedEmail({
      heading: 'Проверка почтового канала',
      intro: 'Это тестовое письмо из административной панели USD.',
      subject: 'USD — проверка почтового канала',
      actionLabel: 'Открыть USD',
      actionUrl: this.frontendUrl,
      note: 'Время запроса: ' + sentAt + '. Ответ почтового провайдера не является подтверждением доставки.',
      frontendUrl: this.frontendUrl,
    });
    return this.runAdminMailTest(async () => {
      await this.sendMessage({ to: email, ...message });
      return {
        success: true as const,
        providerAccepted: true as const,
        deliveryConfirmed: false as const,
        message: 'Почтовый провайдер принял запрос. Проверьте входящие и папку «Спам»; доставка пока не подтверждена.',
      };
    });
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const apiUrl = (process.env.API_PUBLIC_URL ?? process.env.PUBLIC_API_URL ?? 'https://api.usd-russia.ru').replace(/\/+$/, '');
    const verificationUrl = `${apiUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
    const template = await this.getEmailTemplate('AUTH_EMAIL_VERIFICATION');
    const message = renderBrandedEmail({
      subject: 'Подтверждение email — USD',
      template,
      heading: 'Подтверждение email',
      intro: 'Подтвердите адрес электронной почты, чтобы завершить создание аккаунта USD.',
      actionLabel: 'Подтвердить email',
      actionUrl: verificationUrl,
      note: 'Если вы не регистрировались в USD, не переходите по ссылке. Она содержит персональный токен и не должна передаваться другим людям.',
      frontendUrl: this.frontendUrl,
    });
    try {
      await this.sendMessage({ to: email, ...message });
    } catch (error) {
      this.logger.error(`Verification email send failed (${error instanceof Error ? error.name : 'UnknownError'}). Check the configured mail provider and its credentials.`);
      throw new InternalServerErrorException('Не удалось отправить письмо подтверждения. Проверьте настройки почтового сервиса.');
    }
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const template = await this.getEmailTemplate('AUTH_PASSWORD_RESET');
    const message = renderBrandedEmail({
      subject: 'Восстановление пароля — USD',
      template,
      heading: 'Восстановление пароля',
      intro: 'Вы запросили восстановление пароля для аккаунта USD. Перейдите по защищённой ссылке, чтобы задать новый пароль.',
      actionLabel: 'Восстановить пароль',
      actionUrl: resetUrl,
      note: 'Если вы не запрашивали восстановление пароля, проигнорируйте письмо. Никому не сообщайте ссылку и токен.',
      frontendUrl: this.frontendUrl,
    });
    try {
      await this.sendMessage({ to: email, ...message });
    } catch (error) {
      this.logger.error(`Password-reset email send failed (${error instanceof Error ? error.name : 'UnknownError'}).`);
      throw new InternalServerErrorException('Не удалось отправить письмо восстановления. Проверьте настройки почтового сервиса.');
    }
  }

  async sendEmailChangeEmail(email: string, token: string): Promise<void> {
    const url = `${this.frontendUrl}/confirm-email-change?token=${encodeURIComponent(token)}`;
    const template = await this.getEmailTemplate('AUTH_EMAIL_CHANGE');
    const message = renderBrandedEmail({
      subject: 'Подтверждение нового email — USD',
      template,
      heading: 'Подтверждение нового email',
      intro: 'Подтвердите новый адрес электронной почты, чтобы завершить изменение контактных данных аккаунта USD.',
      actionLabel: 'Подтвердить новый email',
      actionUrl: url,
      note: 'Ссылка действует 30 минут. Если вы не меняли email, не переходите по ссылке и обратитесь к администратору аккаунта.',
      frontendUrl: this.frontendUrl,
    });
    try {
      await this.sendMessage({ to: email, ...message });
    } catch (error) {
      this.logger.error(`Email-change message delivery failed (${error instanceof Error ? error.name : 'UnknownError'}).`);
      throw new InternalServerErrorException('Не удалось отправить письмо для изменения email. Проверьте настройки почтового сервиса.');
    }
  }
}