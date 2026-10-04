import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CreateSeasonDto, UpdateSeasonDto } from '../stages/dto/season.dto';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

@Injectable()
export class SeasonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll() {
    return this.prisma.season.findMany({
      orderBy: { year: 'desc' },
      include: {
        stages: {
          where: { isDeleted: false },
          orderBy: { stageNumber: 'asc' },
          select: {
            id: true,
            stageNumber: true,
            name: true,
            city: true,
            date: true,
            status: true,
            registrationOpen: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const season = await this.prisma.season.findUnique({
      where: { id },
      include: {
        stages: {
          where: { isDeleted: false },
          orderBy: { stageNumber: 'asc' },
          include: {
            stageClasses: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
              include: { class: { include: { direction: true } } },
            },
          },
        },
      },
    });
    if (!season) throw new NotFoundException('Сезон не найден');
    return season;
  }

  async create(dto: CreateSeasonDto, request: AuthenticatedRequest) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Название сезона обязательно');

    const existing = await this.prisma.season.findUnique({ where: { year: dto.year } });
    if (existing) throw new BadRequestException(`Сезон ${dto.year} уже существует`);

    const season = await this.prisma.season.create({
      data: {
        year: dto.year,
        name,
        description: dto.description?.trim() || null,
        status: 'DRAFT',
        isActive: false,
      },
    });

    await this.audit.log({
      userId: request.user.sub,
      action: 'SEASON_CREATED',
      entity: 'Season',
      entityId: season.id,
      metadata: { year: season.year, name: season.name },
      ipAddress: request.ip,
    });

    return season;
  }

  async update(id: string, dto: UpdateSeasonDto, request: AuthenticatedRequest) {
    const season = await this.prisma.season.findUnique({ where: { id } });
    if (!season) throw new NotFoundException('Сезон не найден');

    if (dto.name !== undefined && !dto.name.trim()) {
      throw new BadRequestException('Название сезона не может быть пустым');
    }

    const data: any = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
      ...(dto.status !== undefined ? { status: dto.status, isActive: dto.status === 'ACTIVE' } : {}),
    };

    if (dto.status === 'DRAFT' && season.status === 'ARCHIVED') {
      throw new BadRequestException('Архивный сезон нельзя вернуть в черновик');
    }

    const updated = await this.prisma.season.update({ where: { id }, data });

    await this.audit.log({
      userId: request.user.sub,
      action: 'SEASON_UPDATED',
      entity: 'Season',
      entityId: id,
      metadata: { changedFields: Object.keys(data) },
      ipAddress: request.ip,
    });

    return updated;
  }
}
