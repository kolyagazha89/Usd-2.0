import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  HttpException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { PushTransport } from './push.transport';
import { safePushPath } from './push-endpoint';
import type {
  PushAnnouncementDto,
  PushPreferencesDto,
  PushSubscribeDto,
} from './push.dto';

type Category = 'registrationOpen' | 'reminders' | 'announcements';
function calendarDaysUntil(date: Date, now: Date) {
  const day = (value: Date) =>
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  return Math.round((day(date) - day(now)) / 86400000);
}
const publicSubscription = {
  id: true,
  registrationOpen: true,
  reminders: true,
  announcements: true,
  consentAt: true,
  consentVersion: true,
  createdAt: true,
} as const;
@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(PushService.name);
  constructor(
    private readonly db: PrismaService,
    private readonly transport: PushTransport,
    private readonly audit: AuditService,
  ) {}
  onModuleInit() {
    if (!this.transport.configured()) return;
    this.timer = setInterval(() => void this.tick(), 60000);
    this.timer.unref();
    void this.tick();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.schedule();
      await this.processQueue();
      await this.db.pushMessage.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - 90 * 86400000) } },
      });
    } catch {
      this.logger.error(
        'Push worker failed; details omitted to protect subscription credentials',
      );
    } finally {
      this.running = false;
    }
  }
  async list(userId: string) {
    return {
      enabled: this.transport.configured(),
      publicKey: this.transport.publicKey(),
      consentVersion: 'web-push-v1',
      subscriptions: await this.db.pushSubscription.findMany({
        where: { userId },
        select: publicSubscription,
        orderBy: { createdAt: 'desc' },
      }),
    };
  }
  private preferencesData(input: PushPreferencesDto) {
    for (const key of [
      'registrationOpen',
      'reminders',
      'announcements',
    ] as const)
      if (typeof input?.[key] !== 'boolean')
        throw new BadRequestException('Укажите предпочтения уведомлений');
    return {
      registrationOpen: input.registrationOpen,
      reminders: input.reminders,
      announcements: input.announcements,
    };
  }
  async subscribe(userId: string, input: PushSubscribeDto) {
    if (!this.transport.configured())
      throw new ServiceUnavailableException('Push-уведомления пока недоступны');
    if (input?.consent !== true || input.consentVersion !== 'web-push-v1')
      throw new BadRequestException('Нужно явное согласие на push-уведомления');
    const preferences = this.preferencesData(input);
    const user = await this.db.user.findFirst({
      where: { id: userId, isActive: true, emailVerifiedAt: { not: null } },
      select: { id: true },
    });
    if (!user)
      throw new BadRequestException('Сначала подтвердите email аккаунта');
    const checked = await this.transport.validate(input);
    return this.db
      .$transaction(
        async (tx) => {
          const existing = await tx.pushSubscription.findUnique({
            where: { endpoint: checked.endpoint },
          });
          if (existing && existing.userId !== userId)
            throw new ConflictException(
              'Этот браузер подключён к другому аккаунту. Отключите уведомления в том аккаунте или в настройках браузера',
            );
          if (
            !existing &&
            (await tx.pushSubscription.count({ where: { userId } })) >= 10
          )
            throw new BadRequestException(
              'Можно подключить до 10 браузеров. Сначала удалите старую подписку',
            );
          try {
            const saved = await tx.pushSubscription.upsert({
              where: { endpoint: checked.endpoint },
              create: {
                userId,
                endpoint: checked.endpoint,
                p256dh: checked.keys.p256dh,
                auth: checked.keys.auth,
                consentVersion: input.consentVersion,
                ...preferences,
              },
              update: {
                p256dh: checked.keys.p256dh,
                auth: checked.keys.auth,
                consentAt: new Date(),
                consentVersion: input.consentVersion,
                ...preferences,
              },
              select: publicSubscription,
            });
            await tx.auditLog.create({
              data: {
                userId,
                action: 'PUSH_CONSENT_GRANTED',
                entity: 'PushSubscription',
                entityId: saved.id,
                metadata: {
                  version: 'web-push-v1',
                  source: 'participant-settings',
                  ...preferences,
                },
              },
            });
            return saved;
          } catch (error) {
            if ((error as { code?: string })?.code === 'P2002')
              throw new ConflictException(
                'Подписка уже подключена. Обновите страницу',
              );
            throw error;
          }
        },
        { isolationLevel: 'Serializable' },
      )
      .catch((error) => {
        if (error instanceof HttpException) throw error;
        if ((error as { code?: string })?.code === 'P2034')
          throw new ConflictException(
            'Настройки изменились. Повторите подключение',
          );
        throw new ServiceUnavailableException(
          'Не удалось сохранить подписку. Повторите позже',
        );
      });
  }
  async preferences(userId: string, id: string, input: PushPreferencesDto) {
    const result = await this.db.pushSubscription.updateMany({
      where: { id, userId },
      data: this.preferencesData(input),
    });
    if (result.count !== 1) throw new NotFoundException('Подписка не найдена');
    await this.audit.log({
      userId,
      action: 'PUSH_PREFERENCES_UPDATED',
      entity: 'PushSubscription',
      entityId: id,
      metadata: this.preferencesData(input),
    });
    return { success: true };
  }
  async remove(userId: string, id: string) {
    const result = await this.db.pushSubscription.deleteMany({
      where: { id, userId },
    });
    if (result.count !== 1) throw new NotFoundException('Подписка не найдена');
    await this.audit.log({
      userId,
      action: 'PUSH_CONSENT_REVOKED',
      entity: 'PushSubscription',
      entityId: id,
      metadata: { source: 'participant-settings' },
    });
    return { success: true };
  }
  private async enqueue(input: {
    eventKey: string;
    category: Category;
    title: string;
    body: string;
    path: string;
    stageId?: string;
    createdByUserId?: string;
    userIds?: string[];
  }) {
    const path = safePushPath(input.path);
    return this.db
      .$transaction(async (tx) => {
        const existing = await tx.pushMessage.findUnique({
          where: { eventKey: input.eventKey },
        });
        if (existing) return existing;
        const subscriptions = await tx.pushSubscription.findMany({
          where: {
            [input.category]: true,
            user: { isActive: true, emailVerifiedAt: { not: null } },
            ...(input.userIds ? { userId: { in: input.userIds } } : {}),
          },
          select: { id: true },
        });
        return tx.pushMessage.create({
          data: {
            eventKey: input.eventKey,
            category: input.category,
            title: input.title,
            body: input.body,
            path,
            stageId: input.stageId,
            createdByUserId: input.createdByUserId,
            deliveries: {
              create: subscriptions.map((s) => ({ subscriptionId: s.id })),
            },
          },
        });
      })
      .catch(async (error) => {
        if ((error as { code?: string })?.code === 'P2002')
          return this.db.pushMessage.findUniqueOrThrow({
            where: { eventKey: input.eventKey },
          });
        throw error;
      });
  }
  async announce(userId: string, input: PushAnnouncementDto) {
    if (!this.transport.configured())
      throw new ServiceUnavailableException('Push-уведомления пока недоступны');
    if (input.confirmed !== true)
      throw new BadRequestException('Подтвердите отправку уведомления');
    if (
      !/^[0-9a-f-]{36}$/i.test(input.requestKey) ||
      !input.title?.trim() ||
      input.title.length > 80 ||
      !input.body?.trim() ||
      input.body.length > 240
    )
      throw new BadRequestException('Проверьте текст уведомления');
    let userIds: string[] | undefined;
    if (input.stageId) {
      const stage = await this.db.stage.findFirst({
        where: {
          id: input.stageId,
          isDeleted: false,
          status: { in: ['PUBLISHED', 'COMPLETED'] },
        },
      });
      if (!stage) throw new NotFoundException('Опубликованный этап не найден');
      userIds = await this.stageUserIds(input.stageId);
    }
    const message = await this.enqueue({
      eventKey: 'announcement:' + userId + ':' + input.requestKey,
      category: 'announcements',
      title: input.title.trim(),
      body: input.body.trim(),
      path: input.path,
      stageId: input.stageId,
      createdByUserId: userId,
      userIds,
    });
    await this.audit.log({
      userId,
      action: 'PUSH_ANNOUNCEMENT_QUEUED',
      entity: 'PushMessage',
      entityId: message.id,
      metadata: { stageId: input.stageId ?? null },
    });
    return { id: message.id, status: 'QUEUED' };
  }
  private async stageUserIds(stageId: string) {
    const users = await this.db.user.findMany({
      where: {
        isActive: true,
        participant: { registrations: { some: { stageId, status: 'ACTIVE' } } },
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
  async registrationOpened(stageId: string) {
    if (!this.transport.configured()) return;
    const stage = await this.db.stage.findFirst({
      where: {
        id: stageId,
        isDeleted: false,
        status: 'PUBLISHED',
        registrationOpen: true,
        date: { gte: new Date() },
      },
    });
    if (!stage) return;
    const now = Date.now();
    if (
      (stage.registrationStartsAt &&
        stage.registrationStartsAt.getTime() > now) ||
      (stage.registrationEndsAt && stage.registrationEndsAt.getTime() < now)
    )
      return;
    await this.enqueue({
      eventKey: 'registration-open:' + stage.id,
      category: 'registrationOpen',
      title: 'Открыта регистрация USD',
      body: stage.name.slice(0, 240),
      path: '/stages/' + encodeURIComponent(stage.id),
      stageId: stage.id,
    });
  }
  async schedule(now = new Date()) {
    if (!this.transport.configured()) return;
    const stages = await this.db.stage.findMany({
      where: {
        isDeleted: false,
        status: 'PUBLISHED',
        date: { gte: new Date(now.getTime() - 86400000) },
      },
    });
    for (const stage of stages) {
      if (stage.registrationOpen) await this.registrationOpened(stage.id);
      const date = stage.date;
      const days = calendarDaysUntil(date, now);
      if (days !== 1 && days !== 3) continue;
      await this.enqueue({
        eventKey:
          'reminder:' +
          stage.id +
          ':' +
          date.toISOString().slice(0, 10) +
          ':' +
          days,
        category: 'reminders',
        title: days === 1 ? 'Этап USD завтра' : 'До этапа USD три дня',
        body: stage.name.slice(0, 240),
        path: '/stages/' + encodeURIComponent(stage.id),
        stageId: stage.id,
        userIds: await this.stageUserIds(stage.id),
      });
    }
  }
  async processQueue() {
    if (!this.transport.configured()) return;
    const now = new Date();
    const rows = await this.db.pushDelivery.findMany({
      where: {
        OR: [
          { status: { in: ['PENDING', 'RETRY'] }, nextAttemptAt: { lte: now } },
          { status: 'SENDING', leaseUntil: { lt: now } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
      include: { message: true },
    });
    for (const row of rows) {
      const claim = await this.db.pushDelivery.updateMany({
        where: {
          id: row.id,
          status: row.status,
          ...(row.status === 'SENDING'
            ? { leaseUntil: { lt: now } }
            : { nextAttemptAt: { lte: now } }),
        },
        data: {
          status: 'SENDING',
          leaseUntil: new Date(Date.now() + 120000),
          attempts: { increment: 1 },
        },
      });
      if (claim.count !== 1) continue;
      if (row.attempts >= 5) {
        await this.db.pushDelivery.update({
          where: { id: row.id },
          data: { status: 'FAILED', leaseUntil: null },
        });
        continue;
      }
      const subscription = row.subscriptionId
        ? await this.db.pushSubscription.findUnique({
            where: { id: row.subscriptionId },
            include: {
              user: { select: { isActive: true, emailVerifiedAt: true } },
            },
          })
        : null;
      const category = row.message.category as Category;
      let skip =
        !subscription ||
        !subscription.user.isActive ||
        !subscription.user.emailVerifiedAt ||
        !subscription[category] ||
        row.message.createdAt.getTime() < Date.now() - 86400000;
      if (!skip && row.message.stageId) {
        const stage = await this.db.stage.findFirst({
          where: {
            id: row.message.stageId,
            isDeleted: false,
            status: { in: ['PUBLISHED', 'COMPLETED'] },
          },
        });
        const reminderDays = stage ? calendarDaysUntil(stage.date, now) : null;
        const currentReminder =
          stage?.status === 'PUBLISHED' &&
          (reminderDays === 1 || reminderDays === 3) &&
          row.message.eventKey ===
            `reminder:${stage.id}:${stage.date.toISOString().slice(0, 10)}:${reminderDays}`;
        if (
          !stage ||
          (category === 'reminders' && !currentReminder) ||
          (category === 'registrationOpen' &&
            (stage.status !== 'PUBLISHED' ||
              !stage.registrationOpen ||
              stage.date < now ||
              Boolean(
                stage.registrationStartsAt && stage.registrationStartsAt > now,
              ) ||
              Boolean(
                stage.registrationEndsAt && stage.registrationEndsAt < now,
              ))) ||
          (category !== 'registrationOpen' &&
            !(await this.db.registration.findFirst({
              where: {
                stageId: stage.id,
                status: 'ACTIVE',
                participant: { user: { id: subscription!.userId } },
              },
            })))
        )
          skip = true;
      }
      if (skip || !subscription) {
        await this.db.pushDelivery.update({
          where: { id: row.id },
          data: { status: 'SKIPPED', leaseUntil: null },
        });
        continue;
      }
      try {
        const providerStatus = await this.transport.send(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          {
            title: row.message.title,
            body: row.message.body,
            path: row.message.path,
            tag: row.message.id,
          },
        );
        await this.db.pushDelivery.update({
          where: { id: row.id },
          data: {
            status: 'PROVIDER_ACCEPTED',
            acceptedAt: new Date(),
            leaseUntil: null,
            lastStatusCode: providerStatus,
          },
        });
      } catch (error) {
        const raw = (error as { statusCode?: number }).statusCode;
        const code = Number.isInteger(raw) ? raw! : null;
        const expired = code === 404 || code === 410;
        const retry = !code || code === 429 || code >= 500;
        const attempts = row.attempts + 1;
        await this.db.pushDelivery.update({
          where: { id: row.id },
          data: {
            status: expired
              ? 'EXPIRED'
              : retry && attempts < 5
                ? 'RETRY'
                : 'FAILED',
            lastStatusCode: code,
            leaseUntil: null,
            nextAttemptAt: new Date(
              Date.now() + Math.min(60, 2 ** (attempts - 1)) * 60000,
            ),
          },
        });
        if (expired)
          await this.db.pushSubscription.deleteMany({
            where: { id: subscription.id },
          });
      }
    }
  }
  async summary() {
    const messages = await this.db.pushMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        title: true,
        body: true,
        path: true,
        category: true,
        createdAt: true,
        _count: { select: { deliveries: true } },
      },
    });
    const stats = await this.db.pushDelivery.groupBy({
      by: ['messageId', 'status'],
      where: { messageId: { in: messages.map((m) => m.id) } },
      _count: true,
    });
    return {
      enabled: this.transport.configured(),
      subscribers: await this.db.pushSubscription.count({
        where: { user: { isActive: true } },
      }),
      messages: messages.map((m) => ({
        ...m,
        statuses: stats
          .filter((s) => s.messageId === m.id)
          .map((s) => ({ status: s.status, count: s._count })),
      })),
    };
  }
}
