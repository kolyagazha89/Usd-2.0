import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

import * as nodemailer from 'nodemailer';
import { setDefaultResultOrder } from 'node:dns';
import { GoogleService } from '../google/google.service';

// Prefer IPv4 on Railway, where outbound IPv6 SMTP routes may be unavailable.
setDefaultResultOrder('ipv4first');

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly googleService: GoogleService) {}
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

  async hasConfiguredProvider(): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (apiKey) return Boolean(process.env.RESEND_FROM_EMAIL?.trim());

    const googleStatus = await this.googleService.getStatus();
    if (googleStatus.connected) {
      const expectedSender = process.env.SMTP_USER?.trim().toLowerCase();
      const senderMatches = !expectedSender || googleStatus.email?.trim().toLowerCase() === expectedSender;
      return senderMatches && await this.googleService.hasMailSendPermission();
    }

    return process.env.SMTP_EGRESS_ALLOWED === 'true'
      && Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && this.from);
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
        // A successful HTTP response without a JSON body still means the provider accepted the request.
      }
      const providerId = typeof providerResult?.id === 'string' ? providerResult.id : 'unknown';
      this.logger.log(`Resend accepted email (id=${providerId}); inbox delivery is not confirmed by API acceptance.`);
      return;
    }

    const googleStatus = await this.googleService.getStatus();
    if (googleStatus.connected) {
      await this.googleService.sendEmail(message.to, message.subject, message.text, message.html);
      this.logger.log('Google Gmail API accepted email; inbox delivery is not confirmed by API acceptance.');
      return;
    }

    if (process.env.SMTP_EGRESS_ALLOWED !== 'true') {
      throw new Error('SMTP is disabled for this deployment. Configure Resend HTTPS or reconnect the matching Google sender account with Gmail send permission.');
    }
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD || !this.from) {
      throw new Error('No email provider configured: set RESEND_API_KEY and RESEND_FROM_EMAIL, connect Google Gmail API, or explicitly enable SMTP on a Railway plan that supports it.');
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

  async sendVerificationEmail(
    email: string,
    token: string,
  ): Promise<void> {
    const verificationUrl =
      `${this.frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;

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
      this.logger.error(`Verification email send failed (${error instanceof Error ? error.name + ': ' + error.message : 'unknown SMTP error'}). Check Resend, Google Gmail API authorization, or SMTP settings.`);
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
      this.logger.error(`Password-reset email send failed (${error instanceof Error ? error.name + ': ' + error.message : 'unknown mail error'}).`);
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