import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { MailService } from './mail.service';

@Controller('mail')
export class MailController {
  constructor(private readonly mailService: MailService) {}

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
