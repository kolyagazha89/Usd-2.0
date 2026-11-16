import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { lockSiteSettings } from '../site-settings/catalog-concurrency';
import { teamNameKey } from './teams.service';

type Db = Prisma.TransactionClient;
export async function fullTeamManagement(
  db: Pick<Db, 'siteSettings'>,
): Promise<boolean> {
  const row = await db.siteSettings.findUnique({
    where: { id: 'default' },
    select: { registration: true },
  });
  return (
    (row?.registration as Record<string, unknown> | null)
      ?.fullTeamManagement === true
  );
}
@Injectable()
export class TeamManagementService {
  constructor(private readonly prisma: PrismaService) {}
  async mode() {
    return { fullManagement: await fullTeamManagement(this.prisma) };
  }
  async requireFull() {
    if (!(await fullTeamManagement(this.prisma)))
      throw new ForbiddenException('Полное управление командами выключено');
  }
  private async actor(request: AuthenticatedRequest, db: Db) {
    const user = await db.user.findUnique({ where: { id: request.user.sub } });
    if (!user?.isActive || !user.emailVerifiedAt)
      throw new UnauthorizedException('Требуется подтверждённый аккаунт');
    if (!['ADMIN', 'PARTICIPANT'].includes(user.role))
      throw new ForbiddenException('Нет доступа к командам');
    return user;
  }
  async setMode(request: AuthenticatedRequest, enabled: boolean) {
    if (typeof enabled !== 'boolean')
      throw new BadRequestException('Выберите режим команд');
    return this.prisma.$transaction(async (db) => {
      const user = await this.actor(request, db);
      if (user.role !== 'ADMIN')
        throw new ForbiddenException('Действие доступно только ADMIN');
      await lockSiteSettings(db);
      const row = await db.siteSettings.findUnique({
        where: { id: 'default' },
      });
      const registration = {
        ...(row?.registration as Record<string, Prisma.InputJsonValue>),
        fullTeamManagement: enabled,
      };
      await db.siteSettings.upsert({
        where: { id: 'default' },
        update: { registration },
        create: {
          id: 'default',
          branding: {},
          homepage: {},
          stream: {},
          liveResults: {},
          navigation: {},
          contacts: {},
          social: {},
          seo: {},
          legal: {},
          footer: {},
          registration,
        },
      });
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'TEAM_MANAGEMENT_MODE_CHANGED',
          entity: 'SiteSettings',
          entityId: 'default',
          metadata: { fullManagement: enabled },
        },
      });
      return { fullManagement: enabled };
    });
  }
  private async directory(db: Db) {
    const [teams, people, settings] = await Promise.all([
      db.team.findMany({
        select: { id: true, name: true, nameKey: true, isActive: true },
      }),
      db.participant.findMany({
        where: { team: { not: null } },
        distinct: ['team'],
        select: { team: true },
      }),
      db.siteSettings.findUnique({
        where: { id: 'default' },
        select: { catalogs: true },
      }),
    ]);
    const catalog = (settings?.catalogs as Record<string, unknown> | null)
      ?.teams;
    const names = [
      ...teams.filter((t) => t.isActive).map((t) => t.name),
      ...people.map((p) => p.team),
      ...(Array.isArray(catalog) ? catalog : []),
    ];
    const archived = new Set(
      teams.filter((t) => !t.isActive).map((t) => t.nameKey),
    );
    const directory = new Map<string, string>();
    for (const raw of names) {
      if (typeof raw !== 'string') continue;
      const name = raw.trim().replace(/\s+/g, ' '),
        key = teamNameKey(name);
      if (name && !archived.has(key) && !directory.has(key))
        directory.set(key, name);
    }
    return [...directory.values()]
      .sort((a, b) => a.localeCompare(b, 'ru'))
      .map((name) => ({ name }));
  }
  async options(request: AuthenticatedRequest) {
    await this.actor(request, this.prisma);
    return this.directory(this.prisma);
  }
  async selection(request: AuthenticatedRequest) {
    const user = await this.actor(request, this.prisma);
    const participant = user.participantId
      ? await this.prisma.participant.findUnique({
          where: { id: user.participantId },
          select: { team: true },
        })
      : null;
    const member = user.participantId
      ? await this.prisma.teamMembership.findUnique({
          where: { participantId: user.participantId },
          include: { team: { select: { name: true, isActive: true } } },
        })
      : null;
    return {
      team:
        member?.status === 'APPROVED' && member.team.isActive
          ? member.team.name
          : (participant?.team ?? null),
    };
  }
  async select(request: AuthenticatedRequest, name: string) {
    if (typeof name !== 'string' || name.length > 120)
      throw new BadRequestException('Выберите команду из списка');
    return this.prisma.$transaction(
      async (db) => {
        if (await fullTeamManagement(db))
          throw new ForbiddenException('Включён режим заявок в команды');
        const user = await this.actor(request, db);
        if (!user.participantId)
          throw new BadRequestException('Сначала привяжите профиль участника');
        const key = teamNameKey(name);
        const options = key ? await this.directory(db) : [];
        const canonical = options.find(
          (t) => teamNameKey(t.name) === key,
        )?.name;
        if (key && !canonical)
          throw new NotFoundException('Выберите активную команду из списка');
        const team = canonical
          ? await db.team.upsert({
              where: { nameKey: key },
              create: { name: canonical, nameKey: key },
              update: {},
            })
          : null;
        if (team && !team.isActive)
          throw new NotFoundException('Команда в архиве');
        if (team)
          await db.teamMembership.upsert({
            where: { participantId: user.participantId },
            create: {
              teamId: team.id,
              participantId: user.participantId,
              status: 'APPROVED',
            },
            update: {
              teamId: team.id,
              status: 'APPROVED',
              createdAt: new Date(),
            },
          });
        else
          await db.teamMembership.updateMany({
            where: {
              participantId: user.participantId,
              status: { in: ['PENDING', 'APPROVED'] },
            },
            data: { status: 'LEFT' },
          });
        await db.participant.update({
          where: { id: user.participantId },
          data: { team: team?.name ?? null },
        });
        await db.auditLog.create({
          data: {
            userId: user.id,
            action: 'TEAM_SELECTED',
            entity: 'Participant',
            entityId: user.participantId,
            metadata: { teamId: team?.id ?? null },
          },
        });
        return { team: team?.name ?? null };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
