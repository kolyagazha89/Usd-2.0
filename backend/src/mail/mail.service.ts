import {
  Injectable,
  InternalServerErrorException,
  Logger,
  Optional,
} from '@nestjs/common';

import * as nodemailer from 'nodemailer';
import { setDefaultResultOrder } from 'node:dns';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

// Prefer IPv4 on Railway, where outbound IPv6 SMTP routes may be unavailable.
setDefaultResultOrder('ipv4first');

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] ?? char);
}

function renderBrandedEmail(input: {
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
  const html = '<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f2f2f3;font-family:Arial,Helvetica,sans-serif;color:#171719"><div style="padding:18px 10px"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e5e5e7;border-radius:14px;overflow:hidden"><header style="background:#0b0b0d;padding:24px 28px;border-bottom:4px solid #ed2638;color:#fff"><div style="font-size:28px;font-weight:900;letter-spacing:-1px">USD<span style="color:#ed2638">.</span></div><div style="font-size:10px;letter-spacing:2px;color:#bdbdc2;margin-top:4px">ULTIMATE SOUND DESTRUCTION</div></header><main style="padding:30px 28px"><h1 style="font-size:24px;line-height:1.25;margin:0 0 14px">' + escapeHtml(headingValue) + '</h1><div style="font-size:15px;line-height:1.7;margin:0 0 24px">' + bodyHtml + '</div><p style="margin:0 0 24px"><a href="' + actionUrl + '" style="display:inline-block;background:#ed2638;color:#fff;text-decoration:none;font-weight:700;padding:13px 18px;border-radius:8px">' + escapeHtml(buttonValue) + '</a></p><p style="font-size:12px;line-height:1.6;color:#777;margin:0">' + escapeHtml(footerValue).replace(/\n/g, '<br>') + '</p></main><footer style="padding:16px 28px;background:#f8f8f9;border-top:1px solid #e5e5e7;font-size:11px;color:#777"><a href="' + frontendUrl + '" style="color:#777">Открыть сайт USD</a></footer></div></div></body></html>';
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

  private async sendMessage(message: { to: string; subject: string; text: string; html: string }): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (apiKey) {
      const from = process.env.RESEND_FROM_EMAIL?.trim();
      if (!from) {
        throw new Error('RESEND_FROM_EMAIL must be configured when RESEND_API_KEY is set');
      }

      // Resend uses HTTPS (port 443), which works on Railway plans that block SMTP.
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
    if (gmailConfigured || gmailPartiallyConfigured) {
      await this.sendViaGmailApi(message);
      return;
    }

    // Railway deployments may block SMTP egress. HTTPS providers (Resend/Gmail API)
    // are preferred; SMTP is an explicit opt-in only for a plan/network that supports it.
    if (process.env.SMTP_EGRESS_ALLOWED !== 'true') {
      throw new Error('SMTP is disabled for this deployment. Configure RESEND_API_KEY/RESEND_FROM_EMAIL or all Gmail API OAuth settings; enable SMTP only on a plan that supports it.');
    }
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD || !this.from) {
      throw new Error('SMTP is enabled but not fully configured: set SMTP_HOST, SMTP_USER, SMTP_PASSWORD and SMTP_FROM.');
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
    const resend=Boolean(process.env.RESEND_API_KEY?.trim());
    if(resend) {
      const missing=process.env.RESEND_FROM_EMAIL?.trim()?[]:['RESEND_FROM_EMAIL'];
      return {provider:'Resend HTTPS',ready:missing.length===0,missing,note:missing.length?'Нужно указать подтверждённый адрес отправителя Resend.':'Настройки заданы. Для подтверждения доставки отправьте тестовое письмо.'};
    }
    const gmailRequested=Boolean(
      process.env.GMAIL_CLIENT_ID || process.env.GMAIL_CLIENT_SECRET ||
      process.env.GMAIL_REFRESH_TOKEN || process.env.GMAIL_SENDER_EMAIL
    );
    if(gmailRequested) {
      const missing=[
        !((process.env.GMAIL_CLIENT_ID??process.env.GOOGLE_CLIENT_ID)?.trim())&&'GMAIL_CLIENT_ID (или GOOGLE_CLIENT_ID)',
        !((process.env.GMAIL_CLIENT_SECRET??process.env.GOOGLE_CLIENT_SECRET)?.trim())&&'GMAIL_CLIENT_SECRET (или GOOGLE_CLIENT_SECRET)',
        !process.env.GMAIL_REFRESH_TOKEN?.trim()&&'GMAIL_REFRESH_TOKEN',
        !process.env.GMAIL_SENDER_EMAIL?.trim()&&'GMAIL_SENDER_EMAIL',
      ].filter((v):v is string=>Boolean(v));
      return {provider:'Gmail API HTTPS',ready:!missing.length,missing,note:missing.length?'Gmail API настроен частично. Заполните отсутствующие параметры в окружении Railway.':'OAuth-настройки присутствуют; фактическую авторизацию проверит тестовое письмо.'};
    }
    const missing=[
      !process.env.SMTP_HOST?.trim()&&'SMTP_HOST',
      !process.env.SMTP_USER?.trim()&&'SMTP_USER',
      !process.env.SMTP_PASSWORD?.trim()&&'SMTP_PASSWORD',
      !this.from?.trim()&&'SMTP_FROM',
      process.env.SMTP_EGRESS_ALLOWED!=='true'&&'SMTP_EGRESS_ALLOWED=true',
    ].filter((v):v is string=>Boolean(v));
    return {provider:'SMTP',ready:!missing.length,missing,note:missing.length?'Не выбрано работающее HTTPS-подключение либо SMTP отключён. Укажите Resend или Gmail API либо разрешённый SMTP.':'SMTP-настройки присутствуют; доступность сети подтвердит только тест.'};
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
    try {
      await this.sendMessage({ to: email, ...message });
      return {
        success: true,
        providerAccepted: true,
        deliveryConfirmed: false,
        message: 'Почтовый провайдер принял запрос. Проверьте входящие и папку «Спам»; доставка пока не подтверждена.',
      };
    } catch (error) {
      this.logger.error(`Test email send failed (${error instanceof Error ? error.name + ': ' + error.message : 'unknown mail error'}).`);
      throw new InternalServerErrorException('Почтовый провайдер не принял тестовое письмо. Проверьте конфигурацию почты в Railway.');
    }
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const apiUrl = (process.env.API_PUBLIC_URL ?? process.env.PUBLIC_API_URL ?? 'https://usd-api-production.up.railway.app').replace(/\/+$/, '');
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
      this.logger.error(`Verification email send failed (${error instanceof Error ? error.name + ': ' + error.message : 'unknown mail error'}). Check the configured mail provider and its credentials.`);
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
      this.logger.error(`Password-reset email send failed (${error instanceof Error ? error.name + ': ' + error.message : 'unknown mail error'}).`);
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
      this.logger.error(`Email-change message delivery failed (${error instanceof Error ? error.name + ': ' + error.message : 'unknown mail error'}).`);
      throw new InternalServerErrorException('Не удалось отправить письмо для изменения email. Проверьте настройки почтового сервиса.');
    }
  }
}