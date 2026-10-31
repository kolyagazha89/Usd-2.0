import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import type {
  CreateTeamDto,
  UpdateTeamDto,
  TeamPostDto,
  MembershipDecisionDto,
} from './teams.dto';

type Db = Prisma.TransactionClient;
const personSelect = {
  id: true,
  firstName: true,
  lastName: true,
  city: true,
} as const;
const publicPersonSelect = { ...personSelect, photoUrl: true } as const;
export const teamNameKey = (name: string) =>
  name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru');

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  private async actor(request: AuthenticatedRequest, db: Db = this.prisma) {
    const user = request.user?.sub
      ? await db.user.findUnique({
          where: { id: request.user.sub },
          select: {
            id: true,
            role: true,
            isActive: true,
            emailVerifiedAt: true,
            participantId: true,
          },
        })
      : null;
    if (!user?.isActive || !user.emailVerifiedAt)
      throw new UnauthorizedException(
        'Требуется активный аккаунт с подтверждённым email',
      );
    return user;
  }
  private admin(user: { role: string }) {
    if (user.role !== 'ADMIN')
      throw new ForbiddenException('Действие доступно только ADMIN');
  }
  private async managed(
    user: { id: string; role: string },
    id: string,
    db: Db = this.prisma,
  ) {
    const team = await db.team.findUnique({ where: { id } });
    // Use the same failure for an absent/foreign team, avoiding ID enumeration.
    if (
      !team ||
      (user.role !== 'ADMIN' &&
        (team.commanderUserId !== user.id || !team.isActive))
    )
      throw new ForbiddenException('Нет доступа к управлению этой командой');
    return team;
  }
  private async transaction<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === 'P2034' && attempt < 2) continue;
        if (code === 'P2002')
          throw new ConflictException(
            'Название, командир или заявка уже заняты. Обновите данные.',
          );
        if (code === 'P2034')
          throw new ConflictException(
            'Данные изменились одновременно. Обновите страницу и повторите действие.',
          );
        throw error;
      }
    }
    throw new ConflictException('Повторите действие');
  }
  private audit(
    db: Db,
    userId: string,
    action: string,
    id: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    return db.auditLog.create({
      data: {
        userId,
        action,
        entity: 'Team',
        entityId: id,
        ...(metadata ? { metadata } : {}),
      },
    });
  }
  private text(value: unknown, max: number, required = false) {
    if (
      typeof value !== 'string' ||
      value.trim().length > max ||
      (required && !value.trim())
    )
      throw new BadRequestException(
        'Проверьте заполнение и длину полей команды',
      );
    return value.trim();
  }
  private async commander(db: Db, id?: string | null) {
    if (!id) return null;
    const user = await db.user.findUnique({
      where: { id },
      select: { isActive: true, emailVerifiedAt: true },
    });
    if (!user?.isActive || !user.emailVerifiedAt)
      throw new BadRequestException(
        'Командир должен иметь активный аккаунт с подтверждённым email',
      );
    return id;
  }

  async createTeam(request: AuthenticatedRequest, input: CreateTeamDto) {
    this.admin(await this.actor(request));
    const name = this.text(input.name, 120, true).replace(/\s+/g, ' ');
    const nameKey = teamNameKey(name);
    if (nameKey.length > 120)
      throw new BadRequestException('Слишком длинное название команды');
    return this.transaction(async (db) => {
      const user = await this.actor(request, db);
      this.admin(user);
      const team = await db.team.create({
        data: {
          name,
          nameKey,
          description: this.text(input.description ?? '', 4000),
          commanderUserId: await this.commander(db, input.commanderUserId),
        },
      });
      await this.audit(db, user.id, 'TEAM_CREATED', team.id);
      return team;
    });
  }
  async updateTeam(
    request: AuthenticatedRequest,
    id: string,
    input: UpdateTeamDto,
  ) {
    const actor = await this.actor(request);
    await this.managed(actor, id);
    if (
      actor.role !== 'ADMIN' &&
      [input.name, input.commanderUserId, input.isActive].some(
        (value) => value !== undefined,
      )
    )
      throw new ForbiddenException(
        'Название, командир и статус изменяются только ADMIN',
      );
    return this.transaction(async (db) => {
      const user = await this.actor(request, db);
      await this.managed(user, id, db);
      if (
        user.role !== 'ADMIN' &&
        [input.name, input.commanderUserId, input.isActive].some(
          (value) => value !== undefined,
        )
      )
        this.admin(user);
      const data: Prisma.TeamUpdateInput = {};
      if (input.name !== undefined) {
        const name = this.text(input.name, 120, true).replace(/\s+/g, ' ');
        const nameKey = teamNameKey(name);
        if (nameKey.length > 120)
          throw new BadRequestException('Слишком длинное название команды');
        data.name = name;
        data.nameKey = nameKey;
      }
      if (input.description !== undefined)
        data.description = this.text(input.description, 4000);
      if (input.commanderUserId !== undefined) {
        const commanderUserId = await this.commander(db, input.commanderUserId);
        data.commander = commanderUserId
          ? { connect: { id: commanderUserId } }
          : { disconnect: true };
      }
      if (input.isActive !== undefined) {
        if (typeof input.isActive !== 'boolean')
          throw new BadRequestException('Некорректный статус команды');
        data.isActive = input.isActive;
      }
      const team = await db.team.update({ where: { id }, data });
      await this.audit(db, user.id, 'TEAM_UPDATED', id, {
        fields: Object.keys(data),
      });
      return team;
    });
  }
  async adminList(request: AuthenticatedRequest) {
    this.admin(await this.actor(request));
    const [teams, users] = await Promise.all([
      this.prisma.team.findMany({
        orderBy: { name: 'asc' },
        include: {
          commander: { select: { id: true, name: true, email: true } },
          memberships: {
            orderBy: { createdAt: 'desc' },
            include: { participant: { select: personSelect } },
          },
          posts: { orderBy: { createdAt: 'desc' } },
        },
      }),
      this.prisma.user.findMany({
        where: { isActive: true, emailVerifiedAt: { not: null } },
        select: { id: true, name: true, email: true },
        orderBy: { email: 'asc' },
      }),
    ]);
    return { teams, users };
  }
  async mine(request: AuthenticatedRequest) {
    const user = await this.actor(request);
    const [membership, commandedTeam] = await Promise.all([
      user.participantId
        ? this.prisma.teamMembership.findUnique({
            where: { participantId: user.participantId },
            include: {
              team: { select: { id: true, name: true, isActive: true } },
            },
          })
        : null,
      this.prisma.team.findUnique({
        where: { commanderUserId: user.id },
        include: {
          memberships: {
            where: { status: { in: ['PENDING', 'APPROVED'] } },
            orderBy: { createdAt: 'desc' },
            include: { participant: { select: personSelect } },
          },
          posts: { orderBy: { createdAt: 'desc' } },
        },
      }),
    ]);
    return { membership, commandedTeam };
  }
  async requestMembership(request: AuthenticatedRequest, teamId: string) {
    await this.actor(request);
    return this.transaction(async (db) => {
      const user = await this.actor(request, db);
      if (!user.participantId)
        throw new BadRequestException('Сначала привяжите профиль участника');
      const team = await db.team.findUnique({ where: { id: teamId } });
      if (!team?.isActive)
        throw new NotFoundException('Команда не принимает заявки');
      const existing = await db.teamMembership.findUnique({
        where: { participantId: user.participantId },
      });
      if (existing && ['PENDING', 'APPROVED'].includes(existing.status)) {
        if (existing.teamId === teamId) return existing;
        throw new ConflictException(
          'Сначала отмените текущую заявку или выйдите из команды',
        );
      }
      const membership = await db.teamMembership.upsert({
        where: { participantId: user.participantId },
        create: { teamId, participantId: user.participantId },
        update: { teamId, status: 'PENDING', createdAt: new Date() },
      });
      await this.audit(db, user.id, 'TEAM_MEMBERSHIP_REQUESTED', teamId, {
        membershipId: membership.id,
      });
      return membership;
    });
  }
  async leave(request: AuthenticatedRequest) {
    await this.actor(request);
    return this.transaction(async (db) => {
      const user = await this.actor(request, db);
      const member = user.participantId
        ? await db.teamMembership.findUnique({
            where: { participantId: user.participantId },
          })
        : null;
      if (!member || !['PENDING', 'APPROVED'].includes(member.status))
        return { success: true };
      await db.teamMembership.update({
        where: { id: member.id },
        data: { status: 'LEFT' },
      });
      await this.audit(db, user.id, 'TEAM_MEMBERSHIP_LEFT', member.teamId, {
        membershipId: member.id,
      });
      return { success: true };
    });
  }
  async decideMembership(
    request: AuthenticatedRequest,
    teamId: string,
    id: string,
    input: MembershipDecisionDto,
  ) {
    await this.managed(await this.actor(request), teamId);
    return this.transaction(async (db) => {
      const user = await this.actor(request, db);
      await this.managed(user, teamId, db);
      const member = await db.teamMembership.findUnique({ where: { id } });
      if (!member || member.teamId !== teamId)
        throw new NotFoundException('Заявка не найдена');
      if (!['APPROVED', 'REJECTED', 'LEFT'].includes(input.status))
        throw new BadRequestException('Некорректное решение');
      if (member.status === input.status) return member;
      if (
        (input.status === 'LEFT' && member.status !== 'APPROVED') ||
        (input.status !== 'LEFT' && member.status !== 'PENDING')
      )
        throw new ConflictException(
          'Статус заявки уже изменён. Обновите страницу.',
        );
      const updated = await db.teamMembership.update({
        where: { id },
        data: { status: input.status },
      });
      await this.audit(db, user.id, 'TEAM_MEMBERSHIP_' + input.status, teamId, {
        membershipId: id,
      });
      return updated;
    });
  }
  async savePost(
    request: AuthenticatedRequest,
    teamId: string,
    input: TeamPostDto,
    id?: string,
  ) {
    const actor = await this.actor(request);
    await this.managed(actor, teamId);
    if (input.status === 'PUBLISHED') this.admin(actor);
    if (
      !['DRAFT', 'IN_REVIEW', 'PUBLISHED'].includes(input.status) ||
      !['NEWS', 'ACHIEVEMENT'].includes(input.kind)
    )
      throw new BadRequestException('Некорректный тип или статус публикации');
    const title = this.text(input.title, 160, true),
      body = this.text(input.body, 10000, true);
    return this.transaction(async (db) => {
      const user = await this.actor(request, db);
      await this.managed(user, teamId, db);
      if (input.status === 'PUBLISHED') this.admin(user);
      const existing = id
        ? await db.teamPost.findUnique({ where: { id } })
        : null;
      if (id && (!existing || existing.teamId !== teamId))
        throw new NotFoundException('Публикация не найдена');
      if (existing?.status === 'PUBLISHED' && user.role !== 'ADMIN')
        throw new ForbiddenException(
          'Опубликованный материал сначала должен вернуть в черновик ADMIN',
        );
      const data = {
        kind: input.kind,
        title,
        body,
        status: input.status,
        publishedAt:
          input.status === 'PUBLISHED'
            ? (existing?.publishedAt ?? new Date())
            : null,
      };
      const post = id
        ? await db.teamPost.update({ where: { id }, data })
        : await db.teamPost.create({
            data: { ...data, teamId, authorUserId: user.id },
          });
      await this.audit(db, user.id, 'TEAM_POST_' + input.status, teamId, {
        postId: post.id,
      });
      return post;
    });
  }
  async publicTeams() {
    const [teams, people] = await Promise.all([
      this.prisma.team.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          nameKey: true,
          description: true,
          isActive: true,
          memberships: {
            where: { status: 'APPROVED', participant: { isPublic: true } },
            select: { participant: { select: publicPersonSelect } },
          },
          posts: {
            where: { status: 'PUBLISHED' },
            orderBy: { publishedAt: 'desc' },
            select: {
              id: true,
              kind: true,
              title: true,
              body: true,
              publishedAt: true,
            },
          },
        },
      }),
      this.prisma.participant.findMany({
        where: { isPublic: true, team: { not: null } },
        select: { ...publicPersonSelect, team: true },
      }),
    ]);
    const directory = new Map<
      string,
      {
        id: string | null;
        name: string;
        description: string;
        isActive: boolean;
        members: Omit<(typeof people)[number], 'team'>[];
        historicalMembers: Omit<(typeof people)[number], 'team'>[];
        posts: unknown[];
      }
    >();
    for (const team of teams)
      directory.set(team.nameKey, {
        id: team.id,
        name: team.name,
        description: team.description,
        isActive: team.isActive,
        members: team.memberships.map((m) => m.participant),
        historicalMembers: [],
        posts: team.posts,
      });
    for (const person of people) {
      const name = person.team?.trim();
      if (!name) continue;
      const key = teamNameKey(name);
      if (!directory.has(key))
        directory.set(key, {
          id: null,
          name,
          description: '',
          isActive: false,
          members: [],
          historicalMembers: [],
          posts: [],
        });
      const team = directory.get(key)!;
      if (!team.members.some((member) => member.id === person.id)) {
        const { team: _archiveName, ...publicPerson } = person;
        team.historicalMembers.push(publicPerson);
      }
    }
    return [...directory.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'ru'),
    );
  }
}
