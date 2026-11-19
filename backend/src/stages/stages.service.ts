import { PushService } from '../push/push.service';
import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { SiteSettingsService } from '../site-settings/site-settings.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import type { CreateStageDto, UpdateStageDto } from './dto/stage.dto';
import { EmailNotificationsService } from '../mail/email-notifications.service';
import { criticalStageChanges, criticalStageSnapshot, CRITICAL_STAGE_LABELS, type CriticalStageSnapshot } from './stage-critical-notice';

@Injectable()
export class StagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly siteSettings?: SiteSettingsService,
    @Optional() private readonly emailNotifications?: EmailNotificationsService,
    @Optional() private readonly pushNotifications?: PushService,
  ) {}

  async findAll() {
    return this.prisma.stage.findMany({
      where: { isDeleted: false },
      orderBy: [{ date: 'desc' }, { stageNumber: 'asc' }],
      include: { season: true },
    });
  }

  async findPublished() {
    const stages = await this.prisma.stage.findMany({
      where: { isDeleted: false, status: { in: ['PUBLISHED', 'COMPLETED'] } },
      orderBy: [{ date: 'desc' }, { stageNumber: 'asc' }],
      include: { season: true },
    });
    return stages.map(({ rulesSnapshot: _rulesSnapshot, criticalNoticeBaseline: _noticeBaseline,
      criticalNoticeRevision: _noticeRevision, criticalNoticeState: _noticeState,
      criticalNoticeSentAt: _noticeSentAt, ...stage }: any) => stage);
  }

  async findPublishedOne(id: string) {
    const stage = await this.prisma.stage.findFirst({
      where: { id, isDeleted: false, status: { in: ['PUBLISHED', 'COMPLETED'] } },
      include: {
        season: true,
        stageClasses: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: { class: { include: { direction: true } } },
        },
      },
    });
    if (!stage) throw new NotFoundException('Этап не найден или не опубликован');
    const { criticalNoticeBaseline: _noticeBaseline, criticalNoticeRevision: _noticeRevision,
      criticalNoticeState: _noticeState, criticalNoticeSentAt: _noticeSentAt, ...publicStage } = stage;
    return publicStage;
  }

  async setResultsPublication(
    id: string,
    published: boolean,
    confirmed: boolean,
    request: AuthenticatedRequest,
  ) {
    if (confirmed !== true) {
      throw new BadRequestException('Подтвердите изменение публикации результатов');
    }

    const stage = await this.prisma.stage.findFirst({
      where: { id, isDeleted: false },
      select: { id: true, status: true, resultsPublishedAt: true },
    });
    if (!stage) throw new NotFoundException('Этап не найден');

    if (published && !['PUBLISHED', 'COMPLETED'].includes(stage.status)) {
      throw new BadRequestException('Сначала опубликуйте сам этап');
    }
    if (published) {
      const resultCount = await this.prisma.result.count({ where: { registration: { stageId: id } } });
      if (resultCount < 1) {
        throw new BadRequestException('Нельзя опубликовать результаты: сначала внесите хотя бы один результат');
      }
    }

    const updated = await this.prisma.stage.update({
      where: { id },
      data: { resultsPublishedAt: published ? (stage.resultsPublishedAt ?? new Date()) : null },
      select: { id: true, status: true, resultsPublishedAt: true },
    });

    if (published && !stage.resultsPublishedAt && updated.resultsPublishedAt) {
      if (typeof this.emailNotifications?.resultsPublished === 'function') {
        void Promise.resolve(this.emailNotifications.resultsPublished(id, updated.resultsPublishedAt)).catch(() => undefined);
      }
    }

    await this.audit.log({
      userId: request.user.sub,
      action: published ? 'STAGE_RESULTS_PUBLISHED' : 'STAGE_RESULTS_UNPUBLISHED',
      entity: 'Stage',
      entityId: id,
      ipAddress: request.ip,
      metadata: { published, previousPublishedAt: stage.resultsPublishedAt?.toISOString() ?? null },
    });

    return { success: true, stage: updated };
  }

  async findOne(id: string) {
    const stage = await this.prisma.stage.findFirst({
      where: { id, isDeleted: false },
      include: {
        season: true,
        stageClasses: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: { class: { include: { direction: true } } },
        },
      },
    });
    if (!stage) throw new NotFoundException('Этап не найден');
    return stage;
  }

  private async getPublishedRulesSnapshot() {
    if (!this.siteSettings) return null;
    return this.siteSettings.getPublishedRulesSnapshot();
  }

  private validateCoordinates(latitude?: number | null, longitude?: number | null) {
    if (latitude !== undefined && latitude !== null && (latitude < -90 || latitude > 90)) {
      throw new BadRequestException('Широта должна быть в диапазоне от -90 до 90');
    }
    if (longitude !== undefined && longitude !== null && (longitude < -180 || longitude > 180)) {
      throw new BadRequestException('Долгота должна быть в диапазоне от -180 до 180');
    }
  }

  private parseDate(value: string, message: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(message);
    return date;
  }

  private async resolveSeason(dto: CreateStageDto) {
    if (dto.seasonId) {
      const season = await this.prisma.season.findUnique({ where: { id: dto.seasonId } });
      if (!season) throw new NotFoundException('Сезон не найден');
      return season;
    }

    if (!dto.seasonYear) throw new BadRequestException('Необходимо указать seasonId или seasonYear');

    const season = await this.prisma.season.findUnique({ where: { year: dto.seasonYear } });
    if (!season) {
      throw new NotFoundException('Сезон не найден. Сначала создайте сезон через /seasons');
    }
    return season;
  }

  async create(dto: CreateStageDto, request: AuthenticatedRequest) {
    const date = this.parseDate(dto.date, 'Некорректная дата этапа');
    const season = await this.resolveSeason(dto);

    if (dto.stageNumber < 1) throw new BadRequestException('Номер этапа должен быть положительным числом');
    if (dto.registrationOpen && (dto.status ?? 'DRAFT') !== 'PUBLISHED') {
      throw new BadRequestException('Открытая регистрация допустима только для опубликованного этапа');
    }
    if (dto.registrationOpen && !(await this.getPublishedRulesSnapshot())) {
      throw new BadRequestException('Нельзя открыть регистрацию: сначала опубликуйте действующий общий регламент соревнований в разделе «Документы»');
    }
    if ((dto.status ?? 'DRAFT') === 'PUBLISHED' && season.status !== 'ACTIVE') {
      throw new BadRequestException('Нельзя опубликовать этап, пока сезон не активен');
    }
    this.validateCoordinates(dto.latitude, dto.longitude);

    const existing = await this.prisma.stage.findUnique({
      where: { seasonId_stageNumber: { seasonId: season.id, stageNumber: dto.stageNumber } },
    });
    if (existing && !existing.isDeleted) {
      throw new BadRequestException(`Этап №${dto.stageNumber} уже существует в сезоне ${season.year}`);
    }

    const status = dto.status ?? 'DRAFT';
    const rulesSnapshot = status === 'PUBLISHED' && !existing?.rulesSnapshot ? await this.getPublishedRulesSnapshot() : null;
    const data = {
      ...(rulesSnapshot ? { rulesSnapshot: rulesSnapshot as any } : {}),
      seasonId: season.id,
      stageNumber: dto.stageNumber,
      name: dto.name.trim(),
      city: dto.city?.trim() || null,
      date,
      startTimeMsk: dto.startTimeMsk ?? '10:00',
      description: dto.description?.trim() || null,
      venue: dto.venue?.trim() || null,
      address: dto.address?.trim() || null,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      status: dto.status ?? 'DRAFT' as const,
      registrationOpen: dto.registrationOpen ?? false,
      registrationStartsAt: dto.registrationStartsAt ? this.parseDate(dto.registrationStartsAt, 'Некорректная дата начала регистрации') : null,
      registrationEndsAt: dto.registrationEndsAt ? this.parseDate(dto.registrationEndsAt, 'Некорректная дата окончания регистрации') : null,
      isDeleted: false,
      criticalNoticeBaseline: null as any,
      criticalNoticeState: 'IDLE',
      ...(existing ? { criticalNoticeRevision: { increment: 1 } } : {}),
    };
    data.criticalNoticeBaseline = criticalStageSnapshot(data) as any;

    if (data.registrationStartsAt && data.registrationEndsAt && data.registrationStartsAt > data.registrationEndsAt) {
      throw new BadRequestException('Дата начала регистрации не может быть позже даты окончания');
    }

    const stage = existing
      ? await this.prisma.stage.update({ where: { id: existing.id }, data, include: { season: true } })
      : await this.prisma.stage.create({ data, include: { season: true } });

    await this.audit.log({
      userId: request.user.sub,
      action: existing ? 'STAGE_RESTORED' : 'STAGE_CREATED',
      entity: 'Stage',
      entityId: stage.id,
      ipAddress: request.ip,
      metadata: { seasonId: season.id, stageNumber: stage.stageNumber, status: stage.status },
    });

    if (stage.registrationOpen && !existing?.registrationOpen) {
      void this.emailNotifications?.registrationOpened(stage.id).catch(() => undefined);
      void this.pushNotifications?.registrationOpened(stage.id).catch(() => undefined);
    }

    return stage;
  }


  /** Persistent state is compared against what entrants last received, not against
   * the immediately preceding edit. Poster/class/name changes never set pending. */
  private async criticalNoticeMutation(previous: any, next: any) {
    const before = criticalStageSnapshot(previous);
    const after = criticalStageSnapshot(next);
    const changed = criticalStageChanges(before, after);
    const eligibilityChanged = previous.status !== next.status
      && (!['PUBLISHED', 'CANCELLED'].includes(next.status));
    if (!changed.length && !eligibilityChanged) return {};
    const active = await this.prisma.registration.count({
      where: { stageId: previous.id, status: 'ACTIVE' },
    });
    const previousBaseline = previous.criticalNoticeBaseline
      ? previous.criticalNoticeBaseline as CriticalStageSnapshot : before;
    const hasPendingChanges = criticalStageChanges(previousBaseline, after).length > 0;
    // A cancelled event that was already announced should not generate
    // another cancellation email merely because its archived address changed.
    const eligible = active > 0 && (next.status === 'PUBLISHED'
      || (next.status === 'CANCELLED' && !previousBaseline.cancelled));
    return {
      criticalNoticeBaseline: (eligible ? previousBaseline : after) as any,
      criticalNoticeRevision: { increment: 1 },
      criticalNoticeState: eligible && hasPendingChanges ? 'PENDING' : 'IDLE',
    };
  }

  private async criticalNoticeRecipients(stageId: string) {
    const registrations = await this.prisma.registration.findMany({
      where: { stageId, status: 'ACTIVE' },
      select: { participant: { select: { user: {
        select: { id: true, email: true, isActive: true, emailVerifiedAt: true },
      } } } },
    });
    const eligible = new Set<string>();
    for (const registration of registrations) {
      const user = registration.participant?.user;
      if (user?.id && user.email && user.isActive && user.emailVerifiedAt) eligible.add(user.id);
    }
    return eligible.size;
  }

  /** ADMIN-only operational notice preview: no email addresses or message content. */
  async criticalNoticeStatus(id: string) {
    const stage = await this.prisma.stage.findFirst({ where: { id, isDeleted: false } });
    if (!stage) throw new NotFoundException('Этап не найден');
    const current = criticalStageSnapshot(stage);
    const baseline = stage.criticalNoticeBaseline
      ? stage.criticalNoticeBaseline as CriticalStageSnapshot : current;
    const changedFields = criticalStageChanges(baseline, current);
    const recipients = changedFields.length && stage.criticalNoticeState !== 'IDLE'
      ? await this.criticalNoticeRecipients(id) : 0;
    // Recover a process killed during an SMTP batch without losing the button.
    // Per-recipient unique event keys still protect previously accepted emails.
    const staleSending = stage.criticalNoticeState === 'SENDING'
      && stage.updatedAt.getTime() < Date.now() - 30 * 60 * 1000;
    const pending = (stage.criticalNoticeState === 'PENDING' || staleSending)
      && ['PUBLISHED', 'CANCELLED'].includes(stage.status)
      && changedFields.length > 0 && recipients > 0;
    const transport = this.emailNotifications?.criticalStageMailReadiness() ?? { ready: false, reason: 'Почтовый сервис не подключён' };
    return {
      pending,
      revision: stage.criticalNoticeRevision,
      changedFields,
      changedLabels: changedFields.map(key => CRITICAL_STAGE_LABELS[key]),
      recipients,
      sending: stage.criticalNoticeState === 'SENDING' && !staleSending,
      mailReady: transport.ready,
      mailNote: transport.reason,
      lastSentAt: stage.criticalNoticeSentAt,
      canSend: pending && transport.ready,
    };
  }

  /** Manual two-step confirmation, version check and atomic claim prevent
   * duplicate button presses or edits during a send. */
  async sendCriticalNotice(id: string, revision: number, confirmed: boolean, request: AuthenticatedRequest) {
    if (!confirmed) throw new BadRequestException('Подтвердите рассылку зарегистрированным участникам');
    if (!Number.isSafeInteger(revision) || revision < 1) throw new BadRequestException('Некорректная версия изменений');
    const preview = await this.criticalNoticeStatus(id);
    if (!preview.pending || preview.revision !== revision) {
      throw new ConflictException('Изменения этапа устарели или уже обработаны. Обновите карточку.');
    }
    if (!preview.mailReady || !this.emailNotifications) {
      throw new ServiceUnavailableException(preview.mailNote || 'Рассылка служебных писем не настроена');
    }
    const claimed = await this.prisma.stage.updateMany({
      where: { id, criticalNoticeRevision: revision, isDeleted: false,
        OR: [{ criticalNoticeState: 'PENDING' },
          { criticalNoticeState: 'SENDING', updatedAt: { lt: new Date(Date.now() - 30 * 60 * 1000) } }] },
      data: { criticalNoticeState: 'SENDING', updatedAt: new Date() },
    });
    if (claimed.count !== 1) throw new ConflictException('Рассылка уже выполняется или данные этапа изменились');
    let completed = false;
    try {
      const stage = await this.prisma.stage.findFirst({ where: { id, isDeleted: false } });
      if (!stage || stage.criticalNoticeRevision !== revision) throw new ConflictException('Изменились данные этапа');
      const baseline = stage.criticalNoticeBaseline as CriticalStageSnapshot | null;
      const current = criticalStageSnapshot(stage);
      const changes = criticalStageChanges(baseline ?? current, current);
      const summary = await this.emailNotifications.sendCriticalStageNotice(stage, changes, revision,
        async () => {
          const state = await this.prisma.stage.findFirst({
            where: { id, isDeleted: false },
            select: { criticalNoticeRevision: true, criticalNoticeState: true },
          });
          return state?.criticalNoticeRevision === revision && state.criticalNoticeState === 'SENDING';
        }, baseline ?? undefined);
      completed = summary.total > 0 && summary.accepted === summary.total && !summary.interrupted;
      const settled = await this.prisma.stage.updateMany({
        where: { id, criticalNoticeRevision: revision, criticalNoticeState: 'SENDING' },
        data: completed ? {
          criticalNoticeState: 'IDLE',
          criticalNoticeBaseline: current as any,
          criticalNoticeSentAt: new Date(),
        } : { criticalNoticeState: 'PENDING' },
      });
      // A newer stage edit invalidates this revision even if all earlier
      // provider requests were accepted. Never report the old version as done.
      if (settled.count !== 1) completed = false;
      await this.audit.log({
        userId: request.user.sub,
        action: completed ? 'STAGE_CRITICAL_NOTICE_ACCEPTED' : 'STAGE_CRITICAL_NOTICE_PARTIAL',
        entity: 'Stage', entityId: id, ipAddress: request.ip,
        metadata: { revision, changedFields: changes, total: summary.total, accepted: summary.accepted,
          failed: summary.failed, interrupted: summary.interrupted },
      });
      return { ...summary, completed, deliveryConfirmed: false };
    } catch (error) {
      await this.prisma.stage.updateMany({
        where: { id, criticalNoticeRevision: revision, criticalNoticeState: 'SENDING' },
        data: { criticalNoticeState: 'PENDING' },
      });
      throw error;
    }
  }

  async update(id: string, dto: UpdateStageDto, request: AuthenticatedRequest) {
    const stage = await this.prisma.stage.findFirst({ where: { id, isDeleted: false } });
    if (!stage) throw new NotFoundException('Этап не найден');

    const hasOperationalFields = ['stageNumber', 'date', 'startTimeMsk', 'latitude', 'longitude', 'status', 'registrationOpen', 'registrationStartsAt', 'registrationEndsAt']
      .some((key) => Object.prototype.hasOwnProperty.call(dto, key));

    /*
     * ADMIN имеет полный доступ к этапам. Ограничение на изменение
     * операционных полей после завершения/отмены действует только
     * для не-администраторов (например, пользователь с ограниченной ролью).
     */
    const isAdmin = request.user.role === 'ADMIN';

    if (
      !isAdmin &&
      (stage.status === 'COMPLETED' || stage.status === 'CANCELLED') &&
      hasOperationalFields
    ) {
      throw new BadRequestException(
        'Завершённый или отменённый этап можно корректировать только по текстовым полям',
      );
    }

    if (dto.stageNumber !== undefined && dto.stageNumber !== stage.stageNumber) {
      const duplicate = await this.prisma.stage.findUnique({
        where: { seasonId_stageNumber: { seasonId: stage.seasonId, stageNumber: dto.stageNumber } },
      });
      if (duplicate && duplicate.id !== id && !duplicate.isDeleted) {
        throw new BadRequestException(`Этап №${dto.stageNumber} уже существует в этом сезоне`);
      }
    }

    const season = await this.prisma.season.findUnique({ where: { id: stage.seasonId } });
    if (!season) throw new NotFoundException('Сезон не найден');

    if (dto.status === 'PUBLISHED' && season.status !== 'ACTIVE') {
      throw new BadRequestException('Нельзя опубликовать этап, пока сезон не активен');
    }
    if (dto.registrationOpen === true && (dto.status ?? stage.status) !== 'PUBLISHED') {
      throw new BadRequestException('Открытая регистрация допустима только для опубликованного этапа');
    }
    if (dto.registrationOpen === true && !(await this.getPublishedRulesSnapshot())) {
      throw new BadRequestException('Нельзя открыть регистрацию: сначала опубликуйте действующий общий регламент соревнований в разделе «Документы»');
    }
    if (dto.status === 'CANCELLED' || dto.status === 'COMPLETED' || dto.status === 'DRAFT') {
      if (dto.registrationOpen === true) throw new BadRequestException('Для этого статуса регистрация должна быть закрыта');
    }

    const parsedDate = dto.date !== undefined ? this.parseDate(dto.date, 'Некорректная дата этапа') : undefined;
    this.validateCoordinates(dto.latitude, dto.longitude);

    const starts = dto.registrationStartsAt === undefined
      ? undefined
      : dto.registrationStartsAt === null
        ? null
        : this.parseDate(dto.registrationStartsAt, 'Некорректная дата начала регистрации');
    const ends = dto.registrationEndsAt === undefined
      ? undefined
      : dto.registrationEndsAt === null
        ? null
        : this.parseDate(dto.registrationEndsAt, 'Некорректная дата окончания регистрации');

    const effectiveStart = starts === undefined ? stage.registrationStartsAt : starts;
    const effectiveEnd = ends === undefined ? stage.registrationEndsAt : ends;
    if (effectiveStart && effectiveEnd && effectiveStart > effectiveEnd) {
      throw new BadRequestException('Дата начала регистрации не может быть позже даты окончания');
    }

    const shouldCaptureRules = (dto.status === 'PUBLISHED' || stage.status === 'PUBLISHED') && !stage.rulesSnapshot;
    const rulesSnapshot = shouldCaptureRules ? await this.getPublishedRulesSnapshot() : null;
    const data: any = {
      ...(rulesSnapshot ? { rulesSnapshot: rulesSnapshot as any } : {}),
      ...(dto.stageNumber !== undefined ? { stageNumber: dto.stageNumber } : {}),
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.city !== undefined ? { city: dto.city?.trim() || null } : {}),
      ...(dto.date !== undefined ? { date: parsedDate } : {}),
      ...(dto.startTimeMsk !== undefined ? { startTimeMsk: dto.startTimeMsk } : {}),
      ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
      ...(dto.venue !== undefined ? { venue: dto.venue?.trim() || null } : {}),
      ...(dto.address !== undefined ? { address: dto.address?.trim() || null } : {}),
      ...(dto.latitude !== undefined ? { latitude: dto.latitude } : {}),
      ...(dto.longitude !== undefined ? { longitude: dto.longitude } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.registrationOpen !== undefined ? { registrationOpen: dto.registrationOpen } : {}),
      ...(starts !== undefined ? { registrationStartsAt: starts } : {}),
      ...(ends !== undefined ? { registrationEndsAt: ends } : {}),
    };

    if (dto.status === 'CANCELLED' || dto.status === 'COMPLETED' || dto.status === 'DRAFT') {
      data.registrationOpen = false;
    }

    Object.assign(data, await this.criticalNoticeMutation(stage, { ...stage, ...data }));
    const updated = await this.prisma.stage.update({ where: { id }, data, include: { season: true } });

    if (!stage.registrationOpen && updated.registrationOpen) {
      void this.emailNotifications?.registrationOpened(updated.id).catch(() => undefined);
      void this.pushNotifications?.registrationOpened(updated.id).catch(() => undefined);
    }

    // Sending is a separate ADMIN action in the stage card. No automatic
    // emails on saving, publishing, changing artwork/classes or cancelling.

    const changed = Object.keys(data);
    await this.audit.log({
      userId: request.user.sub,
      action: 'STAGE_UPDATED',
      entity: 'Stage',
      entityId: id,
      ipAddress: request.ip,
      metadata: {
        changedFields: changed,
      },
    });

    return updated;
  }

  async remove(id: string, request: AuthenticatedRequest) {
    const stage = await this.prisma.stage.findFirst({ where: { id, isDeleted: false } });
    if (!stage) throw new NotFoundException('Этап не найден');

    const updated = await this.prisma.stage.update({
      where: { id },
      data: { status: 'CANCELLED', registrationOpen: false, isDeleted: false,
        ...await this.criticalNoticeMutation(stage, { ...stage, status: 'CANCELLED' }) },
      include: { season: true },
    });


    await this.audit.log({
      userId: request.user.sub,
      action: 'STAGE_CANCELLED',
      entity: 'Stage',
      entityId: id,
      ipAddress: request.ip,
      metadata: { previousStatus: stage.status },
    });

    return updated;
  }
}
