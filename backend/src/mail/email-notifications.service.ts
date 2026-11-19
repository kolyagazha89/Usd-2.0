import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {publicUsdSiteOrigin} from '../common/public-site-origin';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { renderUsdMailShell } from './mail-brand-layout';
import { MailService } from './mail.service';
import {CRITICAL_STAGE_LABELS, type CriticalStageKey} from '../stages/stage-critical-notice';

type Notice = { eventKey: string; type: string; recipient: string; stageId: string; registrationId?: string; subject: string; heading: string; intro: string; details: string[]; href: string };

function formatStageDate(stage: { date: Date | string; city?: string | null }): string {
  // The date is a calendar day. Start time is stored independently in Moscow time.
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
  private readonly frontendUrl = publicUsdSiteOrigin(process.env.FRONTEND_URL);
  private readonly apiUrl = (process.env.PUBLIC_API_URL ?? process.env.API_BASE_URL ?? process.env.BACKEND_URL ?? 'https://api.usd-russia.ru').replace(/\/+$/, '');

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
    // Personal Yandex mailbox: only account verification/recovery email.
    // Do not run 15-minute reminder scans or auto-mail stage announcements.
    if (process.env.MAIL_ACCOUNT_ONLY === 'true') return;
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
    const stageLine = details.find((line) => line.startsWith('Этап:')) ?? '';
    const stageName = stageLine.replace(/^Этап:\s*/, '').split(' · №')[0] || 'этап USD';
    const variableTexts = (template?.variableTexts && typeof template.variableTexts === 'object' ? template.variableTexts : {}) as Record<string, unknown>;
    const headingText = String(variableTexts.heading ?? '').trim() || notice.heading;
    const introText = String(variableTexts.intro ?? '').trim() || notice.intro;
    const detailsBefore = String(variableTexts.detailsBefore ?? '').trim();
    const detailsAfter = String(variableTexts.detailsAfter ?? '').trim();
    const detailsText = [detailsBefore, details.join('\n'), detailsAfter].filter(Boolean).join('\n');
    const buttonLabel = String(template?.buttonLabel || 'Открыть USD');
    const bodyTemplate = String(template?.body || '{{intro}}\n\n{{details}}');
    const footerText = String(template?.footer || 'Это сервисное сообщение USD. Ответ почтового провайдера подтверждает принятие запроса, но не гарантирует попадание во входящие.');
    const textBody = bodyTemplate
      .replace(/\{\{heading\}\}/g, headingText)
      .replace(/\{\{intro\}\}/g, introText)
      .replace(/\{\{stageName\}\}/g, stageName)
      .replace(/\{\{details\}\}/g, detailsText);
    const subject = String(template?.subject || notice.subject)
      .replace(/\{\{heading\}\}/g, headingText)
      .replace(/\{\{intro\}\}/g, introText)
      .replace(/\{\{stageName\}\}/g, stageName)
      .replace(/\{\{details\}\}/g, detailsText)
      .replace(/\s+/g, ' ').trim();
    const text = [
      'USD · ULTIMATE SOUND DESTRUCTION',
      textBody,
      '',
      buttonLabel + ': ' + notice.href,
      '',
      footerText,
      '',
      'USD · Звук. Мощность. Характер. · Управление рассылкой: ' + this.frontendUrl + '/participant?tab=profile',
    ].join('\n');
    const detailHtml = details.map((line) => '<li style="margin:0 0 8px">' + escapeHtml(line) + '</li>').join('');
    const logoHtml = logoUrl ? '<img src="' + escapeHtml(logoUrl) + '" alt="Логотип USD" width="180" style="display:block;max-width:180px;max-height:64px;width:auto;height:auto;object-fit:contain;margin:0 0 10px" />' : '<div style="font-size:26px;font-weight:900;letter-spacing:-1px">USD<span style="color:#ed2638">.</span></div>';
    const bodyHtml = bodyTemplate.split(/(\{\{(?:heading|intro|stageName|details)\}\})/g).map((part) => {
      if (part === '{{heading}}') return escapeHtml(headingText);
      if (part === '{{intro}}') return escapeHtml(introText);
      if (part === '{{stageName}}') return escapeHtml(stageName);
      if (part === '{{details}}') return [detailsBefore ? '<p style="margin:10px 0">' + escapeHtml(detailsBefore).replace(/\n/g, '<br>') + '</p>' : '', detailHtml ? '<ul style="padding-left:20px;line-height:1.5;font-size:14px;margin:12px 0">' + detailHtml + '</ul>' : '', detailsAfter ? '<p style="margin:10px 0">' + escapeHtml(detailsAfter).replace(/\n/g, '<br>') + '</p>' : ''].join('');
      return escapeHtml(part).replace(/\n/g, '<br>');
    }).join('');
    const footerHtml = escapeHtml(footerText).replace(/\n/g, '<br>');
    const html = renderUsdMailShell({
      heading: headingText,
      bodyHtml,
      actionUrl: notice.href,
      actionLabel: buttonLabel,
      frontendUrl: this.frontendUrl,
      footerHtml,
      logoHtml,
      eyebrow: 'СОРЕВНОВАНИЯ USD · УВЕДОМЛЕНИЕ',
      preheader: introText,
      footerLinkHref: this.frontendUrl + '/participant?tab=profile',
      footerLinkText: 'Управление уведомлениями',
    });
    return { subject, text, html };
  }

  /** An ADMIN can deliberately enable operational-only messages without re-enabling
   * marketing / reminders on a personal Yandex mailbox. */
  criticalStageMailReadiness(): { ready: boolean; reason: string } {
    if (process.env.MAIL_CRITICAL_STAGE_NOTICES_ENABLED !== 'true') {
      return { ready: false, reason: 'Для служебной рассылки включите MAIL_CRITICAL_STAGE_NOTICES_ENABLED=true на сервере API.' };
    }
    const channel = this.mail.getDeliveryStatus();
    return { ready: channel.ready, reason: channel.ready ? 'Почтовый канал готов к отправке.' : 'Почтовый канал не готов. Проверьте настройки в разделе «Почта».' };
  }

  async sendCriticalStageNotice(
    stage: any, changes: CriticalStageKey[], revision: number,
    isStillCurrent: () => Promise<boolean>,
  ): Promise<{total: number; accepted: number; failed: number; interrupted: boolean}> {
    if (!this.criticalStageMailReadiness().ready) throw new BadRequestException('Служебная рассылка не настроена');
    if (!changes.length || !['PUBLISHED', 'CANCELLED'].includes(stage.status)) {
      throw new BadRequestException('Нет важных изменений для уведомления участников');
    }
    const registrations = await this.prisma.registration.findMany({
      where: { stageId: stage.id, status: 'ACTIVE' },
      include: { participant: { include: { user: true } } },
    });
    const recipients = new Map<string, { id: string; email: string; registrationId: string }>();
    for (const registration of registrations as any[]) {
      const user = registration.participant?.user;
      if (user?.id && user.email && user.isActive && user.emailVerifiedAt && !recipients.has(user.id)) {
        recipients.set(user.id, { id: user.id, email: user.email, registrationId: registration.id });
      }
    }
    const cancelled = stage.status === 'CANCELLED';
    const details = [
      'Этап: ' + stage.name + ' · №' + stage.stageNumber,
      'Изменилось: ' + changes.map(key => CRITICAL_STAGE_LABELS[key]).join(', '),
      'Дата: ' + formatStageDate(stage),
      'Начало: ' + (stage.startTimeMsk || '10:00') + ' МСК',
      'Место: ' + [stage.city, stage.venue, stage.address].filter(Boolean).join(', '),
    ];
    const summary = { total: recipients.size, accepted: 0, failed: 0, interrupted: false };
    for (const recipient of recipients.values()) {
      // A concurrent edit invalidates the old revision. Do not keep sending
      // travel information which is already stale.
      if (!(await isStillCurrent())) { summary.interrupted = true; break; }
      const status = await this.dispatch({
        eventKey: 'stage-critical:' + stage.id + ':' + revision + ':' + recipient.id,
        type: cancelled ? 'STAGE_CANCELLED' : 'STAGE_CHANGED',
        recipient: recipient.email,
        stageId: stage.id,
        registrationId: recipient.registrationId,
        subject: cancelled ? 'Важно: этап отменён — ' + stage.name : 'Важно: изменились условия этапа — ' + stage.name,
        heading: cancelled ? 'Этап отменён' : 'Важное изменение по вашему этапу',
        intro: cancelled
          ? 'Организаторы отменили этап, на который вы зарегистрированы.'
          : 'Изменились дата, время или место проведения этапа, на который вы зарегистрированы. Проверьте новые сведения.',
        details,
        href: this.frontendUrl + '/stages/' + encodeURIComponent(stage.id),
      }, true);
      if (status === 'PROVIDER_ACCEPTED') summary.accepted++;
      else summary.failed++;
    }
    return summary;
  }

  private async dispatch(notice: Notice, manuallyApprovedCritical = false) {
    // Keep event-driven stage notifications out of a personal mailbox.
    // Real account messages use MailService directly; manual admin tests
    // remain available to validate the transport with one recipient.
    if (process.env.MAIL_ACCOUNT_ONLY === 'true' &&
      !(manuallyApprovedCritical && process.env.MAIL_CRITICAL_STAGE_NOTICES_ENABLED === 'true'
        && ['STAGE_CHANGED', 'STAGE_CANCELLED'].includes(notice.type))) return 'SKIPPED';
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
    if (!log) return 'FAILED';
    if (log.status === 'PROVIDER_ACCEPTED' || log.status === 'DELIVERED') return 'PROVIDER_ACCEPTED';
    if (log.status === 'FAILED' && (log.attempts >= 5 || log.updatedAt.getTime() > now.getTime() - 15 * 60 * 1000)) return 'FAILED';
    const staleSending = log.status === 'SENDING' && log.updatedAt.getTime() < now.getTime() - 10 * 60 * 1000;
    if (log.status === 'SENDING' && !staleSending) return 'SENDING';
    const claim = await this.prisma.emailNotificationLog.updateMany({
      where: {
        id: log.id,
        status: log.status,
        ...(log.status === 'SENDING' ? { updatedAt: { lte: new Date(now.getTime() - 10 * 60 * 1000) } } : {}),
      },
      data: { status: 'SENDING', lastError: null },
    });
    if (claim.count !== 1) return 'SENDING';
    const logoUrl = await this.getLogoUrl().catch(() => null);
    const templates = await this.getEmailTemplates();
    const triggerHasTemplate = templates.some((item: any) => item?.trigger === notice.type);
    const template = templates.find((item: any) => item?.trigger === notice.type && item?.enabled !== false);
    if (triggerHasTemplate && !template) {
      await this.prisma.emailNotificationLog.update({ where: { id: log.id }, data: { status: 'SKIPPED', lastError: null } });
      this.logger.log('Email notification skipped because its template is disabled: type=' + notice.type);
      return 'SKIPPED';
    }
    const rendered = this.render(notice, logoUrl, template);
    try {
      await this.mail.sendNotificationEmail({ to: notice.recipient, subject: rendered.subject || notice.subject, text: rendered.text, html: rendered.html });
      await this.prisma.emailNotificationLog.update({
        where: { id: log.id },
        data: { status: 'PROVIDER_ACCEPTED', providerAcceptedAt: new Date(), attempts: { increment: 1 }, lastError: null },
      });
      return 'PROVIDER_ACCEPTED';
    } catch (error) {
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      await this.prisma.emailNotificationLog.update({
        where: { id: log.id },
        data: { status: 'FAILED', attempts: { increment: 1 }, lastError: errorName.slice(0, 120) },
      });
      this.logger.error('Email notification failed: type=' + notice.type + ', stage=' + notice.stageId + ', error=' + errorName);
      return 'FAILED';
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

  // Success is confirmed by the QR-pass page. Legacy failed confirmation-email
  // rows are retired by the background scanner, never sent to participants.
  private async notifyStageRegistrants(input: { stage: any; type: string; eventKey: string; heading: string; intro: string; details: string[]; href?: string }) {
    const registrations = await this.prisma.registration.findMany({
      where: { stageId: input.stage.id, status: 'ACTIVE' },
      include: { participant: { include: { user: true } }, car: true, classes: { include: { class: true } } },
    });
    for (const registration of registrations as any[]) {
      const user = registration.participant?.user;
      if (!user?.isActive || !user.email) continue;
      await this.dispatch({
        eventKey: input.eventKey + ':' + registration.id + ':' + user.id,
        type: input.type,
        recipient: user.email,
        stageId: input.stage.id,
        registrationId: registration.id,
        subject: input.heading + ' — ' + input.stage.name,
        heading: input.heading,
        intro: input.intro,
        details: [
          ...input.details,
          'Автомобиль: ' + ([registration.car?.brand, registration.car?.model].filter(Boolean).join(' ') || 'не указан'),
          'Классы: ' + (registration.classes ?? []).map((item: any) => item.class?.name).filter(Boolean).join(', '),
        ],
        href: input.href ?? this.frontendUrl + '/stages/' + encodeURIComponent(input.stage.id),
      });
    }
  }

  async stageChanged(previous: any, updated: any) {
    if (!updated || updated.status === 'DRAFT' || updated.status === 'CANCELLED' && previous.status === 'CANCELLED') return;
    const relevantFields = ['name', 'date', 'startTimeMsk', 'city', 'venue', 'address'];
    const changed = relevantFields.filter((key) => {
      if (key === 'startTimeMsk') return (previous[key] ?? '10:00') !== (updated[key] ?? '10:00');
      const before = previous[key] instanceof Date ? previous[key].toISOString() : String(previous[key] ?? '');
      const after = updated[key] instanceof Date ? updated[key].toISOString() : String(updated[key] ?? '');
      return before !== after;
    });
    const wasCancelled = previous.status !== 'CANCELLED' && updated.status === 'CANCELLED';
    if (!wasCancelled && (changed.length === 0 || updated.status !== 'PUBLISHED')) return;
    const eventType = wasCancelled ? 'STAGE_CANCELLED' : 'STAGE_CHANGED';
    const details = [
      'Этап: ' + updated.name + ' · №' + updated.stageNumber,
      'Дата: ' + formatStageDate(updated),
      'Начало: ' + (updated.startTimeMsk ?? '10:00') + ' МСК',
      'Место: ' + [updated.city, updated.venue, updated.address].filter(Boolean).join(', '),
      ...(changed.length ? ['Изменённые сведения: ' + changed.map((key) => ({ name: 'название этапа', date: 'дата проведения', startTimeMsk: 'время начала (МСК)', city: 'город', venue: 'площадка', address: 'адрес' } as Record<string, string>)[key]).join(', ')] : []),
    ];
    await this.notifyStageRegistrants({
      stage: updated,
      type: eventType,
      eventKey: eventType.toLowerCase() + ':' + updated.id + ':' + updated.updatedAt.toISOString(),
      heading: wasCancelled ? 'Этап отменён' : 'Изменились сведения об этапе',
      intro: wasCancelled
        ? 'Организатор отменил этап. Пожалуйста, ознакомьтесь с информацией и следите за обновлениями на сайте USD.'
        : 'Организатор обновил сведения об этапе. Проверьте актуальные дату, время начала и место проведения.',
      details,
    });
  }

  async inspectionChanged(registrationId: string, inspectionId: string, status: 'PASSED' | 'FAILED', notes?: string | null, className?: string | null, changedAt?: Date) {
    const registration = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      include: { stage: true, participant: { include: { user: true } }, car: true, classes: { include: { class: true } } },
    });
    const user = registration?.participant?.user;
    if (!registration || registration.status !== 'ACTIVE' || !user?.isActive || !user.email) return;
    const type = status === 'PASSED' ? 'INSPECTION_PASSED' : 'INSPECTION_FAILED';
    const heading = status === 'PASSED' ? 'Техническая проверка пройдена' : 'Техническая проверка не пройдена';
    const details = [
      'Этап: ' + registration.stage.name + ' · №' + registration.stage.stageNumber,
      'Дата: ' + formatStageDate(registration.stage),
      'Автомобиль: ' + ([registration.car?.brand, registration.car?.model].filter(Boolean).join(' ') || 'не указан'),
      ...(className ? ['Проверяемый класс: ' + className] : []),
      ...(notes ? ['Комментарий судьи: ' + notes] : []),
      'Классы заявки: ' + (registration.classes ?? []).map((item: any) => item.class?.name).filter(Boolean).join(', '),
    ];
    await this.dispatch({
      eventKey: 'inspection:' + inspectionId + ':' + status + ':' + (changedAt ?? new Date()).toISOString(),
      type, recipient: user.email, stageId: registration.stageId, registrationId,
      subject: heading + ' — ' + registration.stage.name, heading,
      intro: status === 'PASSED'
        ? 'Ваша техническая проверка отмечена как пройденная.'
        : 'По результатам проверки допуск не подтверждён. Ознакомьтесь с комментарием и свяжитесь с организатором при необходимости.',
      details, href: this.frontendUrl + '/participant',
    });
  }

  async registrationCancelled(registrationId: string, cancelledAt: Date = new Date()) {
    const registration = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      include: { stage: true, participant: { include: { user: true } }, car: true, classes: { include: { class: true } } },
    });
    const user = registration?.participant?.user;
    if (!registration || !user?.isActive || !user.email) return;
    await this.dispatch({
      eventKey: 'registration-cancelled:' + registration.id + ':' + cancelledAt.toISOString(),
      type: 'REGISTRATION_CANCELLED', recipient: user.email, stageId: registration.stageId, registrationId,
      subject: 'Регистрация отменена — ' + registration.stage.name,
      heading: 'Регистрация отменена',
      intro: 'Заявка на участие отменена. Если это произошло по ошибке, свяжитесь с организатором USD.',
      details: [
        'Этап: ' + registration.stage.name + ' · №' + registration.stage.stageNumber,
        'Дата: ' + formatStageDate(registration.stage),
        'Автомобиль: ' + ([registration.car?.brand, registration.car?.model].filter(Boolean).join(' ') || 'не указан'),
        'Классы: ' + (registration.classes ?? []).map((item: any) => item.class?.name).filter(Boolean).join(', '),
      ],
      href: this.frontendUrl + '/participant',
    });
  }

  async resultsPublished(stageId: string, publishedAt: Date = new Date()) {
    const stage = await this.prisma.stage.findFirst({ where: { id: stageId, isDeleted: false } });
    if (!stage) return;
    await this.notifyStageRegistrants({
      stage, type: 'STAGE_RESULTS_PUBLISHED',
      eventKey: 'stage-results-published:' + stage.id + ':' + publishedAt.toISOString(),
      heading: 'Результаты этапа опубликованы',
      intro: 'Опубликованы официальные результаты этапа. Откройте страницу этапа, чтобы посмотреть места и результаты.',
      details: [
        'Этап: ' + stage.name + ' · №' + stage.stageNumber,
        'Дата: ' + formatStageDate(stage),
        'Город: ' + (stage.city || 'уточняется'),
      ],
      href: this.frontendUrl + '/stages/' + encodeURIComponent(stage.id) + '/results',
    });
  }

  async recordSet(resultId: string) {
    const record = await this.prisma.record.findFirst({
      where: { resultId, isCurrent: true },
      include: {
        result: {
          include: {
            registration: { include: { stage: true, participant: { include: { user: true } }, car: true } },
            registrationClass: { include: { class: true } },
          },
        },
      },
    });
    const result = record?.result;
    const registration = result?.registration;
    const user = registration?.participant?.user;
    if (!record || !result || !registration || !user?.isActive || !user.email) return;
    const stage = registration.stage;
    const participantName = [registration.participant?.firstName, registration.participant?.lastName].filter(Boolean).join(' ');
    await this.dispatch({
      eventKey: 'new-record:' + record.id,
      type: 'NEW_RECORD_SET', recipient: user.email, stageId: registration.stageId, registrationId: registration.id,
      subject: 'Новый рекорд USD: ' + record.value + ' ' + record.unit,
      heading: 'Новый рекорд USD!',
      intro: 'Поздравляем! Ваш результат стал текущим рекордом USD в своём классе.',
      details: [
        'Класс: ' + result.registrationClass.class.name,
        'Результат: ' + record.value + ' ' + record.unit,
        'Участник: ' + (participantName || 'участник USD'),
        'Автомобиль: ' + ([registration.car?.brand, registration.car?.model].filter(Boolean).join(' ') || 'не указан'),
        'Этап: ' + stage.name + ' · №' + stage.stageNumber,
        'Дата: ' + formatStageDate(stage),
      ],
      href: this.frontendUrl + '/records',
    });
  }

  async sendTestTrigger(type: string, recipient: string, stageId?: string) {
    const stage = stageId ? await this.prisma.stage.findFirst({ where: { id: stageId, isDeleted: false }, select: { id: true, name: true, stageNumber: true, date: true, city: true, venue: true, address: true } }) : null;
    if (stageId && !stage) throw new BadRequestException('Этап не найден');
    const title = stage?.name ?? 'Тестовый этап USD';
    const testHeadings: Record<string, string> = {
      STAGE_REGISTRATION_OPEN: 'Тест: регистрация на этап открыта',
      REGISTRATION_CONFIRMED: 'Тест: заявка подтверждена',
      STAGE_REMINDER_3D: 'Тест: до этапа осталось 3 дня',
      STAGE_REMINDER_1D: 'Тест: напоминание за 1 день',
      STAGE_CHANGED: 'Тест: сведения об этапе изменились',
      STAGE_CANCELLED: 'Тест: этап отменён',
      INSPECTION_PASSED: 'Тест: техосмотр пройден',
      INSPECTION_FAILED: 'Тест: техосмотр не пройден',
      REGISTRATION_CANCELLED: 'Тест: регистрация отменена',
      STAGE_RESULTS_PUBLISHED: 'Тест: результаты опубликованы',
      NEW_RECORD_SET: 'Тест: новый рекорд USD',
    };
    const heading = testHeadings[type] ?? 'Тестовое уведомление USD';
    const details = [
      'Этап: ' + title + (stage?.stageNumber ? ' · №' + stage.stageNumber : ''),
      'Дата: ' + (stage?.date ? formatStageDate(stage) : 'пример даты'),
      'Место: ' + [stage?.city, stage?.venue, stage?.address].filter(Boolean).join(', '),
      ...(['REGISTRATION_CONFIRMED', 'INSPECTION_PASSED', 'INSPECTION_FAILED', 'REGISTRATION_CANCELLED', 'NEW_RECORD_SET'].includes(type) ? ['Автомобиль: Lada Vesta (пример)', 'Номер участника: 001 (пример)', 'Классы: Limited 2.0 (пример)'] : []),
    ];
    const logoUrl = await this.getLogoUrl().catch(() => null);
    const templates = await this.getEmailTemplates();
    const template = templates.find((item: any) => item?.trigger === type);
    const message = this.render({ eventKey: 'test:' + randomUUID(), type, recipient, stageId: stage?.id ?? 'test-stage', subject: heading + ' — USD', heading, intro: 'Это тестовый экземпляр письма. Он не изменяет регистрацию и не запускает рассылку участникам.', details, href: stage ? this.frontendUrl + '/stages/' + encodeURIComponent(stage.id) : this.frontendUrl + '/stages' }, logoUrl, template);
    await this.mail.sendNotificationEmail({ to: recipient, subject: message.subject || heading + ' — USD', text: message.text, html: message.html });
    return { success: true, providerAccepted: true, deliveryConfirmed: false, type, message: 'Тестовое письмо передано на отправку. Проверьте его получение в почте.' };
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

  private async retireFailedRegistrationConfirmations() {
    await this.prisma.emailNotificationLog.updateMany({
      where: { type: 'REGISTRATION_CONFIRMED', status: 'FAILED' },
      data: { status: 'SKIPPED', lastError: null },
    });
  }

  async processReminders() {
    if (this.running) return;
    this.running = true;
    try {
      await this.retryFailedOpeningNotifications();
      await this.retireFailedRegistrationConfirmations();
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
