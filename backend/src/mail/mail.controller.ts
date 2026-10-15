import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { MailService } from './mail.service';
import { EmailNotificationsService } from './email-notifications.service';

@Controller('mail')
export class MailController {
  constructor(private readonly mailService: MailService, private readonly emailNotifications: EmailNotificationsService) {}

  @Roles('ADMIN')
  @Post('test-trigger')
  async sendTestTrigger(@Body() body: { email?: string; type?: string; stageId?: string }) {
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const allowed = ['STAGE_REGISTRATION_OPEN', 'REGISTRATION_CONFIRMED', 'STAGE_REMINDER_3D', 'STAGE_REMINDER_1D'];
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Укажите корректный email для тестового письма');
    if (!allowed.includes(String(body?.type))) throw new BadRequestException('Укажите один из четырёх поддерживаемых типов триггера');
    const stageId = typeof body?.stageId === 'string' ? body.stageId.trim() : undefined;
    if (stageId && stageId.length > 100) throw new BadRequestException('Некорректный идентификатор этапа');
    return this.emailNotifications.sendTestTrigger(body.type as 'STAGE_REGISTRATION_OPEN' | 'REGISTRATION_CONFIRMED' | 'STAGE_REMINDER_3D' | 'STAGE_REMINDER_1D', email, stageId || undefined);
  }

  @Roles('ADMIN')
  @Post('test')
  sendTestEmail(@Body() body: { email?: string }) {
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      throw new BadRequestException('Укажите корректный email для тестового письма');
    }
    return this.mailService.sendTestEmail(email);
  }
}
