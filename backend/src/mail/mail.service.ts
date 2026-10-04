import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter =
    nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(
        process.env.SMTP_PORT ?? 465,
      ),
      secure:
        process.env.SMTP_SECURE === 'true',
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

  async sendVerificationEmail(
    email: string,
    token: string,
  ): Promise<void> {
    const verificationUrl =
      `${this.frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;

    try {
      await this.transporter.sendMail({
        from: this.from,
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
    } catch {
      throw new InternalServerErrorException(
        'Не удалось отправить письмо подтверждения',
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
      await this.transporter.sendMail({
        from: this.from,
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
    } catch {
      throw new InternalServerErrorException(
        'Не удалось отправить письмо восстановления',
      );
    }
  }
  async sendEmailChangeEmail(
    email: string,
    token: string,
  ): Promise<void> {
    const url = `${this.frontendUrl}/confirm-email-change?token=${encodeURIComponent(token)}`;
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject: 'Подтверждение нового email — USD',
        text: ['Здравствуйте!', '', 'Для подтверждения нового email перейдите по ссылке:', url, '', 'Ссылка действует 30 минут.'].join('\\n'),
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#111"><h2>USD — подтверждение нового email</h2><p>Для подтверждения нового email нажмите кнопку ниже.</p><p><a href="${url}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:6px">Подтвердить email</a></p><p style="font-size:13px;color:#666">Ссылка действует 30 минут.</p></div>`,
      });
    } catch {
      throw new InternalServerErrorException('Не удалось отправить письмо для изменения email');
    }
  }

}