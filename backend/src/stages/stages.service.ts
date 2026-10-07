import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import type { CreateStageDto, UpdateStageDto } from './dto/stage.dto';

@Injectable()
export class StagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll() {
    return this.prisma.stage.findMany({
      where: { isDeleted: false },
      orderBy: [{ date: 'desc' }, { stageNumber: 'asc' }],
      include: { season: true },
    });
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

    const data = {
      seasonId: season.id,
      stageNumber: dto.stageNumber,
      name: dto.name.trim(),
      city: dto.city?.trim() || null,
      date,
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
    };

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

    return stage;
  }

  async update(id: string, dto: UpdateStageDto, request: AuthenticatedRequest) {
    const stage = await this.prisma.stage.findFirst({ where: { id, isDeleted: false } });
    if (!stage) throw new NotFoundException('Этап не найден');

    const hasOperationalFields = ['stageNumber', 'date', 'latitude', 'longitude', 'status', 'registrationOpen', 'registrationStartsAt', 'registrationEndsAt']
      .some((key) => Object.prototype.hasOwnProperty.call(dto, key));

    /*
     * ADMIN имеет полный доступ к этапам. Ограничение на изменение
     * операционных полей после завершения/отмены действует только
     * для не-администраторов (например, JUDGE).
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

    const data: any = {
      ...(dto.stageNumber !== undefined ? { stageNumber: dto.stageNumber } : {}),
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.city !== undefined ? { city: dto.city?.trim() || null } : {}),
      ...(dto.date !== undefined ? { date: parsedDate } : {}),
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

    const updated = await this.prisma.stage.update({ where: { id }, data, include: { season: true } });

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
      data: { status: 'CANCELLED', registrationOpen: false, isDeleted: false },
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
