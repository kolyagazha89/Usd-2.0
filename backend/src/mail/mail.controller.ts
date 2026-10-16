import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { MailService } from './mail.service';
import { EmailNotificationsService } from './email-notifications.service';

@Controller('mail')
export class MailController {
  private normalizeEmail(value: unknown): string {
    return typeof value === 'string'
      ? value.replace(/[\u200B-\u200D\uFEFF]/g, '').trim()
      : '';
  }

  private validateEmail(email: string): void {
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Укажите корректный email для тестового письма');
    }
  }
  constructor(private readonly mailService: MailService, private readonly emailNotifications: EmailNotificationsService) {}

  @Roles('ADMIN')
  @Post('test-trigger')
  async sendTestTrigger(@Body() body: { email?: string; type?: string; stageId?: string }) {
    const email = this.normalizeEmail(body?.email);
    const allowed = ['STAGE_REGISTRATION_OPEN', 'REGISTRATION_CONFIRMED', 'STAGE_REMINDER_3D', 'STAGE_REMINDER_1D', 'STAGE_CHANGED', 'STAGE_CANCELLED', 'INSPECTION_PASSED', 'INSPECTION_FAILED', 'REGISTRATION_CANCELLED', 'STAGE_RESULTS_PUBLISHED', 'NEW_RECORD_SET', 'AUTH_EMAIL_VERIFICATION', 'AUTH_PASSWORD_RESET', 'AUTH_EMAIL_CHANGE'];
    this.validateEmail(email);
    if (!allowed.includes(String(body?.type))) throw new BadRequestException('Выберите поддерживаемый триггер письма');
    const type = String(body.type);
    if (type.startsWith('AUTH_')) {
      return this.mailService.sendTestAuthTemplate(email, type as 'AUTH_EMAIL_VERIFICATION' | 'AUTH_PASSWORD_RESET' | 'AUTH_EMAIL_CHANGE');
    }
    const stageId = typeof body?.stageId === 'string' ? body.stageId.trim() : undefined;
    if (stageId && stageId.length > 100) throw new BadRequestException('Некорректный идентификатор этапа');
    return this.emailNotifications.sendTestTrigger(type, email, stageId || undefined);
  }

  @Roles('ADMIN')
  @Post('test')
  sendTestEmail(@Body() body: { email?: string }) {
    const email = this.normalizeEmail(body?.email);
    this.validateEmail(email);
    return this.mailService.sendTestEmail(email);
  }
}
