import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';

type Notice = { eventKey: string; type: string; recipient: string; stageId: string; registrationId?: string; subject: string; heading: string; intro: string; details: string[]; href: string };

function stageTimeZone(city?: string | null): string {
  const value = String(city ?? '').toLocaleLowerCase('ru');
  if (/(тюмен|екатеринбург|челябинск|курган|сургут|ханты-мансийск|нижневартовск)/.test(value)) return 'Asia/Yekaterinburg';
  if (/омск/.test(value)) return 'Asia/Omsk';
  if (/(новосибир|томск|барнаул|кемеров|красноярск|абакан)/.test(value)) return 'Asia/Novosibirsk';
  if (/(иркутск|улан-удэ)/.test(value)) return 'Asia/Irkutsk';
  if (/(владивосток|хабаровск)/.test(value)) return 'Asia/Vladivostok';
  if (/калининград/.test(value)) return 'Europe/Kaliningrad';
  return 'Europe/Moscow';
}

function formatStageDate(stage: { date: Date | string; city?: string | null }): string {
  return new Date(stage.date).toLocaleString('ru-RU', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: stageTimeZone(stage.city),
  });
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

  constructor(private readonly prisma: PrismaService, private readonly mail: MailService) {}

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

  private render(notice: Notice) {
    const details = notice.details.filter(Boolean);
    const text = [
      'USD · ULTIMATE SOUND DESTRUCTION',
      notice.heading,
      '',
      notice.intro,
      '',
      ...details,
      '',
      'Подробнее: ' + notice.href,
      '',
      'Это сервисное сообщение системы USD.',
    ].join('\n');
    const detailHtml = details.map((line) => '<li style="margin:0 0 8px">' + escapeHtml(line) + '</li>').join('');
    const html = '<!doctype html><html lang="ru"><body style="margin:0;background:#f2f2f3;font-family:Arial,Helvetica,sans-serif;color:#171719"><div style="max-width:620px;margin:24px auto;background:#fff;border:1px solid #e5e5e7;border-radius:14px;overflow:hidden"><div style="background:#0b0b0d;padding:24px 28px;border-bottom:4px solid #ed2638;color:#fff"><div style="font-size:26px;font-weight:900;letter-spacing:-1px">USD<span style="color:#ed2638">.</span></div><div style="font-size:10px;letter-spacing:2px;color:#bdbdc2;margin-top:4px">ULTIMATE SOUND DESTRUCTION</div></div><div style="padding:30px 28px"><h1 style="font-size:24px;line-height:1.25;margin:0 0 14px">' + escapeHtml(notice.heading) + '</h1><p style="font-size:15px;line-height:1.65;margin:0 0 18px">' + escapeHtml(notice.intro) + '</p>' + (detailHtml ? '<ul style="padding-left:20px;line-height:1.5;font-size:14px">' + detailHtml + '</ul>' : '') + '<p style="margin:26px 0"><a href="' + escapeHtml(notice.href) + '" style="display:inline-block;background:#ed2638;color:#fff;text-decoration:none;font-weight:700;padding:13px 18px;border-radius:8px">Открыть USD</a></p><p style="font-size:12px;line-height:1.6;color:#73737a">Это сервисное сообщение USD. Ответ почтового провайдера подтверждает принятие запроса, но не гарантирует попадание во входящие.</p></div><div style="padding:16px 28px;background:#f8f8f9;border-top:1px solid #e5e5e7;font-size:11px;color:#777">USD · Звук. Мощность. Характер. · <a href="' + escapeHtml(this.frontendUrl + '/participant?tab=profile') + '" style="color:#777;text-decoration:underline">Управление рассылкой</a></div></div></body></html>';
    return { text, html };
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
    if (log.status === 'SENT') return;
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
    const rendered = this.render(notice);
    try {
      await this.mail.sendNotificationEmail({ to: notice.recipient, subject: notice.subject, ...rendered });
      await this.prisma.emailNotificationLog.update({
        where: { id: log.id },
        data: { status: 'SENT', providerAcceptedAt: new Date(), attempts: { increment: 1 }, lastError: null },
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
      where: { participantId: registration.participantId, isActive: true, emailVerifiedAt: { not: null } },
      select: { id: true, email: true },
    });
    if (!user) return;
    const classes = (registration.classes ?? []).map((item: any) => item.class?.name).filter(Boolean);
    const stage = registration.stage ?? {};
    const car = registration.car ?? {};
    await this.dispatch({
      eventKey: 'registration-confirmed:' + registration.id,
      type: 'REGISTRATION_CONFIRMED',
      recipient: user.email,
      stageId: stage.id ?? registration.stageId,
      registrationId: registration.id,
      subject: 'Заявка подтверждена: ' + (stage.name ?? 'этап USD'),
      heading: 'Вы зарегистрированы на этап',
      intro: 'Заявка успешно сохранена в системе USD. Сохраните это письмо с данными участия.',
      details: [
        'Этап: ' + (stage.name ?? 'Этап USD'),
        'Дата: ' + (stage.date ? formatStageDate(stage) : 'уточняется'),
        'Автомобиль: ' + [car.brand, car.model].filter(Boolean).join(' '),
        'Номер участника: ' + (registration.participantNumber ?? 'назначается'),
        'Классы: ' + (classes.join(', ') || 'не указаны'),
        'Место: ' + [stage.city, stage.venue, stage.address].filter(Boolean).join(', '),
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
    const message = this.render({ eventKey: 'test:' + randomUUID(), type, recipient, stageId: stage?.id ?? 'test-stage', subject: heading + ' — USD', heading, intro: 'Это тестовый шаблон из настроек почты USD. Письмо не изменяет регистрацию и не запускает рассылку участникам.', details, href: stage ? this.frontendUrl + '/stages/' + encodeURIComponent(stage.id) : this.frontendUrl + '/stages' });
    await this.mail.sendNotificationEmail({ to: recipient, subject: heading + ' — USD', ...message });
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
        where: { id: userId, isActive: true, emailVerifiedAt: { not: null }, newsletterConsentAt: { not: null }, newsletterConsentRevokedAt: null },
        select: { id: true, email: true },
      }) : null;
      if (!stage || !user || user.email !== log.recipient) {
        await this.prisma.emailNotificationLog.update({ where: { id: log.id }, data: { status: 'SKIPPED', lastError: null } });
        continue;
      }
      await this.dispatch({
        eventKey: log.eventKey, type: 'STAGE_REGISTRATION_OPEN', recipient: user.email, stageId: stage.id,
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
      const inThreeDays = new Date(now.getTime() + 72 * 60 * 60 * 1000);
      const stages = await this.prisma.stage.findMany({
        where: { status: 'PUBLISHED', isDeleted: false, date: { gt: now, lte: inThreeDays } },
        select: { id: true, name: true, stageNumber: true, date: true, city: true, venue: true, address: true },
      });
      for (const stage of stages) {
        const hours = (new Date(stage.date).getTime() - now.getTime()) / 3600000;
        const reminderType = hours > 24 ? 'STAGE_REMINDER_3D' : 'STAGE_REMINDER_1D';
        const eventKey = reminderType + ':' + stage.id;
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
