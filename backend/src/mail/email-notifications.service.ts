import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';

type Notice = { eventKey: string; type: string; recipient: string; stageId: string; registrationId?: string; subject: string; heading: string; intro: string; details: string[]; href: string };

function formatStageDate(stage: { date: Date | string; city?: string | null }): string {
  // Stage dates are calendar dates normalized to UTC noon; no event start-time field exists.
  // Show only the calendar date rather than inventing a local time from the storage timestamp.
  return new Date(stage.date).toLocaleDateString('ru-RU', { dateStyle: 'long', timeZone: 'UTC' });
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] ?? char);
}

@Injectable()
export class EmailNotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailNotificationsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly frontendUrl = (process.env.FRONTEND_URL ?? 'https://usd-russia.ru').replace(/\/+$/, '');
  private readonly apiUrl = (process.env.PUBLIC_API_URL ?? process.env.API_BASE_URL ?? process.env.BACKEND_URL ?? 'https://usd-api-production.up.railway.app').replace(/\/+$/, '');

  private async getLogoUrl(): Promise<string | null> {
    const row = await this.prisma.siteSettings.findUnique({ where: { id: 'default' }, select: { branding: true } });
    const branding = row?.branding as Record<string, any> | null;
    if (!String(branding?.logoUrl ?? '').trim()) return null;
    return this.apiUrl + '/media/public-file/SITE_ASSET/branding-logoUrl';
  }

  constructor(private readonly prisma: PrismaService, private readonly mail: MailService) {}

  private async getEmailTemplates(): Promise<any[]> {
    if (typeof this.prisma.siteSettings?.findUnique !== 'function') return [];
    const settings = await this.prisma.siteSettings.findUnique({ where: { id: 'default' }, select: { registration: true } }).catch(() => null);
    const registration = (settings?.registration ?? {}) as Record<string, any>;
    return Array.isArray(registration.emailTemplates) ? registration.emailTemplates : [];
  }

  onModuleInit() {
    // Run after boot and every 15 minutes. The database unique eventKey makes
    // multiple replicas safe; provider acceptance is never described as delivery.
    void this.processReminders();
    this.timer = setInterval(() => void this.processReminders(), 15 * 60 * 1000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private render(notice: Notice, logoUrl: string | null = null, template?: Record<string, any>) {
    const details = notice.details.filter(Boolean);
    const detailsText = details.join('\n');
    const stageLine = details.find((line) => line.startsWith('Этап:')) ?? '';
    const stageName = stageLine.replace(/^Этап:\s*/, '').split(' · №')[0] || 'этап ЮСД';
    const buttonLabel = String(template?.buttonLabel || 'Открыть ЮСД');
    const bodyTemplate = String(template?.body || '{{intro}}\n\n{{details}}');
    const footerText = String(template?.footer || 'Это сервисное сообщение ЮСД. Ответ почтового провайдера подтверждает принятие запроса, но не гарантирует попадание во входящие.');
    const textBody = bodyTemplate
      .replace(/\{\{heading\}\}/g, notice.heading)
      .replace(/\{\{intro\}\}/g, notice.intro)
      .replace(/\{\{stageName\}\}/g, stageName)
      .replace(/\{\{details\}\}/g, detailsText);
    const subject = String(template?.subject || notice.subject)
      .replace(/\{\{heading\}\}/g, notice.heading)
      .replace(/\{\{intro\}\}/g, notice.intro)
      .replace(/\{\{stageName\}\}/g, stageName)
      .replace(/\{\{details\}\}/g, detailsText)
      .replace(/\s+/g, ' ').trim();
    const text = [
      'ЮСД · ULTIMATE SOUND DESTRUCTION',
      textBody,
      '',
      buttonLabel + ': ' + notice.href,
      '',
      footerText,
      '',
      'ЮСД · Звук. Мощность. Характер. · Управление рассылкой: ' + this.frontendUrl + '/participant?tab=profile',
    ].join('\n');
    const detailHtml = details.map((line) => '<li style="margin:0 0 8px">' + escapeHtml(line) + '</li>').join('');
    const logoHtml = logoUrl ? '<img src="' + escapeHtml(logoUrl) + '" alt="Логотип ЮСД" width="180" style="display:block;max-width:180px;max-height:64px;width:auto;height:auto;object-fit:contain;margin:0 0 10px" />' : '<div style="font-size:26px;font-weight:900;letter-spacing:-1px">ЮСД<span style="color:#ed2638">.</span></div>';
    const bodyHtml = bodyTemplate.split(/(\{\{(?:heading|intro|stageName|details)\}\})/g).map((part) => {
      if (part === '{{heading}}') return escapeHtml(notice.heading);
      if (part === '{{intro}}') return escapeHtml(notice.intro);
      if (part === '{{stageName}}') return escapeHtml(stageName);
      if (part === '{{details}}') return detailHtml ? '<ul style="padding-left:20px;line-height:1.5;font-size:14px;margin:12px 0">' + detailHtml + '</ul>' : '';
      return escapeHtml(part).replace(/\n/g, '<br>');
    }).join('');
    const footerHtml = escapeHtml(footerText).replace(/\n/g, '<br>');
    const html = '<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f2f2f3;font-family:Arial,Helvetica,sans-serif;color:#171719"><div style="padding:18px 10px"><div style="max-width:620px;margin:24px auto;background:#fff;border:1px solid #e5e5e7;border-radius:14px;overflow:hidden"><div style="background:#0b0b0d;padding:24px 28px;border-bottom:4px solid #ed2638;color:#fff">' + logoHtml + '<div style="font-size:10px;letter-spacing:2px;color:#bdbdc2;margin-top:4px">ULTIMATE SOUND DESTRUCTION</div></div><div style="padding:30px 28px"><h1 style="font-size:24px;line-height:1.25;margin:0 0 14px">' + escapeHtml(notice.heading) + '</h1><div style="font-size:15px;line-height:1.7;margin:0 0 18px">' + bodyHtml + '</div><p style="margin:26px 0"><a href="' + escapeHtml(notice.href) + '" style="display:inline-block;background:#ed2638;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:8px;font-size:14px">' + escapeHtml(buttonLabel) + '</a></p><p style="font-size:12px;line-height:1.6;color:#73737a;margin:0">' + footerHtml + '</p></div><div style="padding:16px 28px;background:#f8f8f9;border-top:1px solid #e5e5e7;font-size:11px;color:#777">ЮСД · Звук. Мощность. Характер. · <a href="' + escapeHtml(this.frontendUrl + '/participant?tab=profile') + '" style="color:#777;text-decoration:underline">Управление рассылкой</a></div></div></div></body></html>';
    return { subject, text, html };
  }

  private async dispatch(notice: Notice) {
    const now = new Date();
    let log = await this.prisma.emailNotificationLog.findUnique({ where: { eventKey: notice.eventKey } });
    if (!log) {
      try {
        log = await this.prisma.emailNotificationLog.create({
          data: {
            id: randomUUID(), eventKey: notice.eventKey, type: notice.type,
            recipient: notice.recipient, stageId: notice.stageId,
            registrationId: notice.registrationId, status: 'PENDING', attempts: 0,
          },
        });
      } catch (error) {
        if ((error as { code?: string })?.code !== 'P2002') throw error;
        log = await this.prisma.emailNotificationLog.findUnique({ where: { eventKey: notice.eventKey } });
      }
    }
    if (!log) return;
    if (log.status === 'PROVIDER_ACCEPTED' || log.status === 'DELIVERED') return;
    if (log.status === 'FAILED' && (log.attempts >= 5 || log.updatedAt.getTime() > now.getTime() - 15 * 60 * 1000)) return;
    const staleSending = log.status === 'SENDING' && log.updatedAt.getTime() < now.getTime() - 10 * 60 * 1000;
    if (log.status === 'SENDING' && !staleSending) return;
    const claim = await this.prisma.emailNotificationLog.updateMany({
      where: {
        id: log.id,
        status: log.status,
        ...(log.status === 'SENDING' ? { updatedAt: { lte: new Date(now.getTime() - 10 * 60 * 1000) } } : {}),
      },
      data: { status: 'SENDING', lastError: null },
    });
    if (claim.count !== 1) return;
    const logoUrl = await this.getLogoUrl().catch(() => null);
    const templates = await this.getEmailTemplates();
    const triggerHasTemplate = templates.some((item: any) => item?.trigger === notice.type);
    const template = templates.find((item: any) => item?.trigger === notice.type && item?.enabled !== false);
    if (triggerHasTemplate && !template) {
      await this.prisma.emailNotificationLog.update({ where: { id: log.id }, data: { status: 'SKIPPED', lastError: null } });
      this.logger.log('Email notification skipped because its template is disabled: type=' + notice.type);
      return;
    }
    const rendered = this.render(notice, logoUrl, template);
    try {
      await this.mail.sendNotificationEmail({ to: notice.recipient, subject: rendered.subject || notice.subject, text: rendered.text, html: rendered.html });
      await this.prisma.emailNotificationLog.update({
        where: { id: log.id },
        data: { status: 'PROVIDER_ACCEPTED', providerAcceptedAt: new Date(), attempts: { increment: 1 }, lastError: null },
      });
    } catch (error) {
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      await this.prisma.emailNotificationLog.update({
        where: { id: log.id },
        data: { status: 'FAILED', attempts: { increment: 1 }, lastError: errorName.slice(0, 120) },
      });
      this.logger.error('Email notification failed: type=' + notice.type + ', stage=' + notice.stageId + ', error=' + errorName);
    }
  }

  async registrationOpened(stageId: string) {
    const stage = await this.prisma.stage.findFirst({
      where: { id: stageId, status: 'PUBLISHED', registrationOpen: true, isDeleted: false },
      include: { season: true },
    });
    if (!stage) return;
    const recipients = await this.prisma.user.findMany({
      where: {
        isActive: true, emailVerifiedAt: { not: null },
        newsletterConsentAt: { not: null }, newsletterConsentRevokedAt: null,
      },
      select: { id: true, email: true },
    });
    for (const user of recipients) {
      const notice: Notice = {
        eventKey: 'stage-registration-open:' + stage.id + ':' + stage.updatedAt.toISOString() + ':' + user.id,
        type: 'STAGE_REGISTRATION_OPEN',
        recipient: user.email,
        stageId: stage.id,
        subject: 'Открыта регистрация: ' + stage.name + ' — USD',
        heading: 'Регистрация на этап открыта',
        intro: 'Можно подать заявку на участие в этапе ' + stage.name + '.',
        details: [
          'Этап: ' + stage.name + ' · №' + stage.stageNumber,
          'Дата: ' + formatStageDate(stage),
          'Место: ' + [stage.city, stage.venue, stage.address].filter(Boolean).join(', '),
        ],
        href: this.frontendUrl + '/stages/' + encodeURIComponent(stage.id),
      };
      await this.dispatch(notice);
    }
  }

  async registrationConfirmed(registration: any) {
    const user = await this.prisma.user.findFirst({
      where: { participantId: registration.participantId, isActive: true },
      select: { id: true, email: true, emailVerifiedAt: true },
    });
    if (!user?.email) {
      this.logger.warn('Registration confirmation skipped: no active account with an email is linked to participant ' + String(registration.participantId ?? 'unknown'));
      return;
    }
    const classItems = registration.classes ?? [];
    const classes = classItems.map((item: any) => String(item.class?.name ?? '')).filter(Boolean);
    const bassRaceClasses = classes.filter((name: string) => /^BassRace\b/i.test(name));
    const regularClasses = classes.filter((name: string) => !/^BassRace\b/i.test(name));
    const stage = registration.stage ?? {};
    const car = registration.car ?? {};
    const settingsRow = await this.prisma.siteSettings.findUnique({ where: { id: 'default' }, select: { registration: true } }).catch(() => null);
    const registrationSettings = (settingsRow?.registration ?? {}) as Record<string, any>;
    const mainClassPrice = Math.max(0, Number(registrationSettings.price ?? 2000) || 0);
    const additionalClassPrice = Math.max(0, Number(registrationSettings.additionalClassPrice ?? 2000) || 0);
    const classCount = classItems.length;
    const amountDue = classCount > 0 ? mainClassPrice + Math.max(0, classCount - 1) * additionalClassPrice : 0;
    await this.dispatch({
      eventKey: 'registration-confirmed:' + registration.id + ':' + new Date(registration.registeredAt ?? Date.now()).toISOString(),
      type: 'REGISTRATION_CONFIRMED',
      recipient: user.email,
      stageId: stage.id ?? registration.stageId,
      registrationId: registration.id,
      subject: 'Заявка подтверждена: ' + (stage.name ?? 'этап USD'),
      heading: 'Вы зарегистрированы на этап',
      intro: 'Заявка успешно сохранена в системе USD. Сохраните это письмо с данными участия.',
      details: [
        'Этап: ' + (stage.name ?? 'Этап USD') + (stage.stageNumber ? ' · №' + stage.stageNumber : ''),
        'Дата проведения: ' + (stage.date ? formatStageDate(stage) : 'уточняется'),
        'Город: ' + (stage.city || 'уточняется'),
        'Площадка и адрес: ' + [stage.venue, stage.address].filter(Boolean).join(', '),
        'Автомобиль: ' + ([car.brand, car.model].filter(Boolean).join(' ') || 'не указан'),
        ...(car.registrationNumber ? ['Государственный номер автомобиля: ' + car.registrationNumber] : []),
        'Ваш номер участника на этапе: ' + (registration.participantNumber ?? 'назначается'),
        'Основные классы (' + regularClasses.length + '): ' + (regularClasses.join(', ') || 'не указаны'),
        ...(bassRaceClasses.length ? ['Классы BassRace (' + bassRaceClasses.length + '): ' + bassRaceClasses.map((name: string) => name.replace(/^BassRace\s*/i, '')).join(', ')] : []),
        ...(classCount > 0 ? ['Оплата участия: ' + amountDue.toLocaleString('ru-RU') + ' ₽ на месте (' + mainClassPrice.toLocaleString('ru-RU') + ' ₽ за основной класс' + (classCount > 1 ? ' + ' + (classCount - 1) + ' доп. × ' + additionalClassPrice.toLocaleString('ru-RU') + ' ₽' : '') + '). Онлайн-регистрация бесплатна.'] : ['Оплата участия: уточняется организатором.']),
        'Управление заявкой: откройте личный кабинет участника на сайте ЮСД.',
      ],
      href: this.frontendUrl + '/participant',
    });
  }

  async sendTestTrigger(type: 'STAGE_REGISTRATION_OPEN' | 'REGISTRATION_CONFIRMED' | 'STAGE_REMINDER_3D' | 'STAGE_REMINDER_1D', recipient: string, stageId?: string) {
    const stage = stageId ? await this.prisma.stage.findFirst({ where: { id: stageId, isDeleted: false }, select: { id: true, name: true, stageNumber: true, date: true, city: true, venue: true, address: true } }) : null;
    if (stageId && !stage) throw new BadRequestException('Этап не найден');
    const title = stage?.name ?? 'Тестовый этап USD';
    const heading = type === 'STAGE_REGISTRATION_OPEN' ? 'Тест: регистрация на этап открыта' : type === 'REGISTRATION_CONFIRMED' ? 'Тест: заявка подтверждена' : type === 'STAGE_REMINDER_3D' ? 'Тест: до этапа осталось 3 дня' : 'Тест: напоминание за 1 день';
    const details = [
      'Этап: ' + title + (stage?.stageNumber ? ' · №' + stage.stageNumber : ''),
      'Дата: ' + (stage?.date ? formatStageDate(stage) : 'пример даты'),
      'Место: ' + [stage?.city, stage?.venue, stage?.address].filter(Boolean).join(', '),
      ...(type === 'REGISTRATION_CONFIRMED' ? ['Автомобиль: Lada Vesta (пример)', 'Номер участника: 001 (пример)', 'Классы: Limited 2.0 (пример)'] : []),
    ];
    const logoUrl = await this.getLogoUrl().catch(() => null);
    const templates = await this.getEmailTemplates();
    const template = templates.find((item: any) => item?.trigger === type);
    const message = this.render({ eventKey: 'test:' + randomUUID(), type, recipient, stageId: stage?.id ?? 'test-stage', subject: heading + ' — ЮСД', heading, intro: 'Это тестовый экземпляр письма. Он не изменяет регистрацию и не запускает рассылку участникам.', details, href: stage ? this.frontendUrl + '/stages/' + encodeURIComponent(stage.id) : this.frontendUrl + '/stages' }, logoUrl, template);
    await this.mail.sendNotificationEmail({ to: recipient, subject: message.subject || heading + ' — ЮСД', text: message.text, html: message.html });
    return { success: true, providerAccepted: true, deliveryConfirmed: false, type, message: 'Провайдер принял тестовый запрос. Проверьте входящие и папку «Спам»; фактическая доставка не подтверждена.' };
  }

  private async retryFailedOpeningNotifications() {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);
    const failed = await this.prisma.emailNotificationLog.findMany({
      where: { type: 'STAGE_REGISTRATION_OPEN', status: 'FAILED', attempts: { lt: 5 }, updatedAt: { lte: cutoff } },
      orderBy: { updatedAt: 'asc' },
      take: 100,
    });
    for (const log of failed) {
      const userId = log.eventKey.split(':').at(-1);
      const stage = log.stageId ? await this.prisma.stage.findFirst({
        where: { id: log.stageId, status: 'PUBLISHED', registrationOpen: true, isDeleted: false },
        include: { season: true },
      }) : null;
      const user = userId ? await this.prisma.user.findFirst({
        where: {
          id: userId, isActive: true, emailVerifiedAt: { not: null },
          newsletterConsentAt: { not: null }, newsletterConsentRevokedAt: null,
        },
        select: { id: true, email: true },
      }) : null;
      if (!stage || !user || user.email !== log.recipient) {
        await this.prisma.emailNotificationLog.update({ where: { id: log.id }, data: { status: 'SKIPPED', lastError: null } });
        continue;
      }
      await this.dispatch({
        eventKey: log.eventKey,
        type: 'STAGE_REGISTRATION_OPEN',
        recipient: user.email,
        stageId: stage.id,
        subject: 'Открыта регистрация: ' + stage.name + ' — USD',
        heading: 'Регистрация на этап открыта',
        intro: 'Можно подать заявку на участие в этапе ' + stage.name + '.',
        details: [
          'Этап: ' + stage.name + ' · №' + stage.stageNumber,
          'Дата: ' + formatStageDate(stage),
          'Место: ' + [stage.city, stage.venue, stage.address].filter(Boolean).join(', '),
        ],
        href: this.frontendUrl + '/stages/' + encodeURIComponent(stage.id),
      });
    }
  }

  private async retryFailedRegistrationConfirmations() {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);
    const failed = await this.prisma.emailNotificationLog.findMany({
      where: { type: 'REGISTRATION_CONFIRMED', status: 'FAILED', attempts: { lt: 5 }, updatedAt: { lte: cutoff } },
      orderBy: { updatedAt: 'asc' },
      take: 100,
    });
    for (const log of failed) {
      if (!log.registrationId) {
        await this.prisma.emailNotificationLog.update({ where: { id: log.id }, data: { status: 'SKIPPED', lastError: null } });
        continue;
      }
      const registration = await this.prisma.registration.findUnique({
        where: { id: log.registrationId },
        include: { stage: true, car: true, classes: { include: { class: true } } },
      });
      const user = registration ? await this.prisma.user.findFirst({
        where: { participantId: registration.participantId, isActive: true, emailVerifiedAt: { not: null } },
        select: { id: true, email: true },
      }) : null;
      if (!registration || !user || user.email !== log.recipient) {
        await this.prisma.emailNotificationLog.update({ where: { id: log.id }, data: { status: 'SKIPPED', lastError: null } });
        continue;
      }
      await this.registrationConfirmed(registration);
    }
  }

  async processReminders() {
    if (this.running) return;
    this.running = true;
    try {
      await this.retryFailedOpeningNotifications();
      await this.retryFailedRegistrationConfirmations();
      const now = new Date();
      const dayMs = 24 * 60 * 60 * 1000;
      // Stage dates are calendar dates normalized to UTC noon, not event start times.
      // Compare UTC calendar days so a stage two days away is never mislabeled as a three-day reminder.
      const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const endOfThirdDay = new Date(todayUtc.getTime() + 4 * dayMs);
      const stages = await this.prisma.stage.findMany({
        where: { status: 'PUBLISHED', isDeleted: false, date: { gt: now, lt: endOfThirdDay } },
        select: { id: true, name: true, stageNumber: true, date: true, city: true, venue: true, address: true },
      });
      for (const stage of stages) {
        const stageDayUtc = new Date(stage.date);
        stageDayUtc.setUTCHours(0, 0, 0, 0);
        const daysUntil = Math.round((stageDayUtc.getTime() - todayUtc.getTime()) / dayMs);
        if (daysUntil !== 3 && daysUntil !== 1) continue;
        const reminderType = daysUntil === 3 ? 'STAGE_REMINDER_3D' : 'STAGE_REMINDER_1D';
        const eventKey = reminderType + ':' + stage.id + ':' + stageDayUtc.toISOString().slice(0, 10);
        const registrations = await this.prisma.registration.findMany({
          where: { stageId: stage.id, status: 'ACTIVE' },
          include: { participant: { include: { user: true } }, car: true, classes: { include: { class: true } } },
        });
        for (const registration of registrations) {
          const user = registration.participant?.user;
          if (!user || !user.isActive || !user.emailVerifiedAt) continue;
          const label = reminderType === 'STAGE_REMINDER_3D' ? 'До этапа осталось 3 дня' : 'Напоминание: этап уже скоро';
          await this.dispatch({
            eventKey: eventKey + ':' + registration.id,
            type: reminderType,
            recipient: user.email,
            stageId: stage.id,
            registrationId: registration.id,
            subject: label + ' — ' + stage.name,
            heading: label,
            intro: 'Проверьте информацию об этапе и подготовьте автомобиль к соревнованию.',
            details: [
              'Этап: ' + stage.name + ' · №' + stage.stageNumber,
              'Дата: ' + formatStageDate(stage),
              'Место: ' + [stage.city, stage.venue, stage.address].filter(Boolean).join(', '),
              'Автомобиль: ' + [registration.car?.brand, registration.car?.model].filter(Boolean).join(' '),
              'Классы: ' + (registration.classes ?? []).map((item: any) => item.class?.name).filter(Boolean).join(', '),
            ],
            href: this.frontendUrl + '/stages/' + encodeURIComponent(stage.id),
          });
        }
      }
    } catch (error) {
      this.logger.error('Reminder scan failed: ' + (error instanceof Error ? error.name : 'UnknownError'));
    } finally {
      this.running = false;
    }
  }
}
