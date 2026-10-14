import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

import * as nodemailer from 'nodemailer';
import { setDefaultResultOrder } from 'node:dns';
import { randomBytes } from 'node:crypto';

// Prefer IPv4 on Railway, where outbound IPv6 SMTP routes may be unavailable.
setDefaultResultOrder('ipv4first');

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
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
      return;
    }

    const gmailConfigured = Boolean(
      (process.env.GMAIL_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID)?.trim()
      && (process.env.GMAIL_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET)?.trim()
      && process.env.GMAIL_REFRESH_TOKEN?.trim()
      && process.env.GMAIL_SENDER_EMAIL?.trim(),
    );
    const gmailPartiallyConfigured = Boolean(
      process.env.GMAIL_CLIENT_ID || process.env.GMAIL_CLIENT_SECRET
      || process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_SECRET
      || process.env.GMAIL_REFRESH_TOKEN || process.env.GMAIL_SENDER_EMAIL,
    );
    if (gmailConfigured || gmailPartiallyConfigured) {
      await this.sendViaGmailApi(message);
      return;
    }

    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD || !this.from) {
      throw new Error('No email provider configured: set RESEND_API_KEY and RESEND_FROM_EMAIL, all four GMAIL_* variables, or complete SMTP settings');
    }

    await this.transporter.sendMail({
      from: this.from,
      ...message,
    });
  }

  async sendVerificationEmail(
    email: string,
    token: string,
  ): Promise<void> {
    const apiUrl = (process.env.API_PUBLIC_URL ?? process.env.PUBLIC_API_URL ?? 'https://usd-api-production.up.railway.app').replace(/\/+$/, '');
    const verificationUrl =
      `${apiUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;

    try {
      await this.sendMessage({
        to: email,
        subject: 'Подтверждение email — USD',
        text: [
          'Здравствуйте!',
          '',
          'Для подтверждения email перейдите по ссылке:',
          verificationUrl,
          '',
          'Если вы не регистрировались на USD, просто проигнорируйте это письмо.',
        ].join('\n'),
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
            <h2>USD — подтверждение email</h2>

            <p>Здравствуйте!</p>

            <p>
              Для подтверждения вашего email нажмите
              на кнопку ниже.
            </p>

            <p>
              <a
                href="${verificationUrl}"
                style="
                  display:inline-block;
                  padding:12px 20px;
                  background:#111;
                  color:#fff;
                  text-decoration:none;
                  border-radius:6px;
                "
              >
                Подтвердить email
              </a>
            </p>

            <p style="font-size:13px;color:#666">
              Если вы не регистрировались на USD,
              просто проигнорируйте это письмо.
            </p>
          </div>
        `,
      });
    } catch (error) {
      // Log SMTP diagnostics without logging tokens, email body, or credentials.
      this.logger.error(`Verification email delivery failed (${error instanceof Error ? error.name + ': ' + error.message : 'unknown SMTP error'}). Check SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD and SMTP_FROM.`);
      throw new InternalServerErrorException(
        'Не удалось отправить письмо подтверждения. Проверьте настройки почтового сервиса.',
      );
    }
  }

  async sendPasswordResetEmail(
    email: string,
    token: string,
  ): Promise<void> {
    const resetUrl =
      `${this.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;

    try {
      await this.sendMessage({
        to: email,
        subject: 'Восстановление пароля — USD',
        text: [
          'Здравствуйте!',
          '',
          'Для восстановления пароля перейдите по ссылке:',
          resetUrl,
          '',
          'Если вы не запрашивали восстановление пароля, просто проигнорируйте это письмо.',
        ].join('\n'),
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
            <h2>USD — восстановление пароля</h2>

            <p>Здравствуйте!</p>

            <p>
              Для восстановления пароля нажмите
              на кнопку ниже.
            </p>

            <p>
              <a
                href="${resetUrl}"
                style="
                  display:inline-block;
                  padding:12px 20px;
                  background:#111;
                  color:#fff;
                  text-decoration:none;
                  border-radius:6px;
                "
              >
                Восстановить пароль
              </a>
            </p>

            <p style="font-size:13px;color:#666">
              Если вы не запрашивали восстановление пароля,
              просто проигнорируйте это письмо.
            </p>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(`Password-reset email delivery failed (${error instanceof Error ? error.name + ': ' + error.message : 'unknown mail error'}).`);
      throw new InternalServerErrorException(
        'Не удалось отправить письмо восстановления. Проверьте настройки почтового сервиса.',
      );
    }
  }
  async sendEmailChangeEmail(
    email: string,
    token: string,
  ): Promise<void> {
    const url = `${this.frontendUrl}/confirm-email-change?token=${encodeURIComponent(token)}`;
    try {
      await this.sendMessage({
        to: email,
        subject: 'Подтверждение нового email — USD',
        text: ['Здравствуйте!', '', 'Для подтверждения нового email перейдите по ссылке:', url, '', 'Ссылка действует 30 минут.'].join('\\n'),
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111"><h2>USD — подтверждение нового email</h2><p>Для подтверждения нового email нажмите кнопку ниже.</p><p><a href="${url}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:6px">Подтвердить email</a></p><p style="font-size:13px;color:#666">Ссылка действует 30 минут.</p></div>`,
      });
    } catch (error) {
      this.logger.error(`Email-change message delivery failed (${error instanceof Error ? error.name + ': ' + error.message : 'unknown mail error'}).`);
      throw new InternalServerErrorException('Не удалось отправить письмо для изменения email. Проверьте настройки почтового сервиса.');
    }
  }

}