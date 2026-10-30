import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ExpressAdapter } from '@nestjs/platform-express';
import request from 'supertest';
import { TeamsModule } from '../src/teams/teams.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';

const integration =
  process.env.USD_TEAMS_INTEGRATION_TEST === '1' ? describe : describe.skip;
// Only synthetic local PostgreSQL 18 data. Refuses arbitrary endpoints or databases.
integration('team/commander HTTP acceptance on isolated PostgreSQL 18', () => {
  let app: INestApplication, db: PrismaService;
  const tokens: Record<string, string> = {},
    users: Record<string, string> = {},
    people: Record<string, string> = {};
  let team: any, other: any, memberId: string, post: any;
  const tag = randomUUID().slice(0, 8);
  const legacy = 'Archive Team ' + tag;
  const api = (who: string) => ({
    get: (path: string) =>
      request(app.getHttpServer())
        .get(path)
        .auth(tokens[who], { type: 'bearer' }),
    post: (path: string, body: any = {}) =>
      request(app.getHttpServer())
        .post(path)
        .auth(tokens[who], { type: 'bearer' })
        .send(body),
    patch: (path: string, body: any) =>
      request(app.getHttpServer())
        .patch(path)
        .auth(tokens[who], { type: 'bearer' })
        .send(body),
  });
  const payload = {
    kind: 'NEWS',
    title: 'Synthetic team news',
    body: 'A synthetic achievement.',
    status: 'IN_REVIEW',
  };
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.pathname !== '/usd_teams_test'
    )
      throw Error('Refusing non-local/non-synthetic database');
    const module = await Test.createTestingModule({
      imports: [TeamsModule],
    }).compile();
    db = module.get(PrismaService);
    const version = await db.$queryRaw<
      Array<{ server_version: string }>
    >`SHOW server_version`;
    if (!version[0]?.server_version.startsWith('18.'))
      throw Error('PostgreSQL 18 required');
    const jwt = new JwtService({
      secret: 'synthetic-team-test-secret-minimum-32-characters',
      signOptions: { issuer: 'usd-2.0-api', audience: 'usd-2.0-client' },
    });
    app = module.createNestApplication(new ExpressAdapter());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalGuards(
      new JwtAuthGuard(jwt, module.get(Reflector), db),
      new RolesGuard(module.get(Reflector), db),
    );
    await app.init();
    const role = await db.role.create({
      data: {
        key: 'team-judge-' + tag,
        name: 'Synthetic judge',
        permissions: { teams: ['*'], inspections: ['view'] },
      },
    });
    for (const name of [
      'admin',
      'commander',
      'otherCommander',
      'member',
      'privateMember',
      'outsider',
      'judge',
      'unlinked',
    ]) {
      const p = await db.participant.create({
        data: {
          firstName: name,
          lastName: 'Synthetic-' + tag,
          team: legacy,
          phone: '+79999999999',
          isPublic: name !== 'privateMember',
        },
      });
      const u = await db.user.create({
        data: {
          email: name + '-' + tag + '@teams.invalid',
          passwordHash: 'unused-synthetic-hash',
          role: name === 'admin' ? 'ADMIN' : 'PARTICIPANT',
          participantId: name === 'unlinked' ? null : p.id,
          emailVerifiedAt: new Date(),
          ...(name === 'judge' ? { customRoleId: role.id } : {}),
        },
      });
      users[name] = u.id;
      people[name] = p.id;
      tokens[name] = await jwt.signAsync({ sub: u.id, role: 'ADMIN' }); // claims cannot grant ADMIN
    }
  });
  afterAll(async () => {
    await app?.close();
  });

  it('requires verified authentication and reserves team creation/assignment to ADMIN even with custom teams:* grants', async () => {
    await request(app.getHttpServer())
      .post('/teams')
      .send({ name: 'Anon' })
      .expect(401);
    await api('outsider').post('/teams', { name: 'Forbidden' }).expect(403);
    await api('judge')
      .post('/teams', { name: 'Forbidden custom role' })
      .expect(403);
    team = (
      await api('admin')
        .post('/teams', {
          name: 'Team ' + tag,
          commanderUserId: users.commander,
        })
        .expect(201)
    ).body;
    other = (
      await api('admin')
        .post('/teams', {
          name: 'Other ' + tag,
          commanderUserId: users.otherCommander,
        })
        .expect(201)
    ).body;
    await api('admin')
      .post('/teams', { name: '  TEAM  ' + tag })
      .expect(409);
    await api('admin')
      .post('/teams', {
        name: 'Duplicate commander ' + tag,
        commanderUserId: users.commander,
      })
      .expect(409);
    await api('commander')
      .patch('/teams/' + team.id, { commanderUserId: users.outsider })
      .expect(403);
    await api('commander')
      .patch('/teams/' + other.id, { description: 'hijack' })
      .expect(403);
    await api('outsider').get('/teams/admin').expect(403);
    await api('judge').get('/teams/admin').expect(403);
    await api('judge').get('/teams/me').expect(200);
    await api('unlinked')
      .post('/teams/' + team.id + '/join')
      .expect(400);
    await api('admin')
      .patch('/teams/' + other.id, { commanderUserId: users.unlinked })
      .expect(200);
    expect(
      (await api('unlinked').get('/teams/me').expect(200)).body.commandedTeam
        .id,
    ).toBe(other.id);
    await api('admin')
      .patch('/teams/' + other.id, { commanderUserId: users.otherCommander })
      .expect(200);
  });
  it('keeps join requests private, idempotent and one-at-a-time, and rejects cross-team member IDs', async () => {
    const joined = await api('member')
      .post('/teams/' + team.id + '/join')
      .expect(201);
    memberId = joined.body.id;
    expect(
      (
        await api('member')
          .post('/teams/' + team.id + '/join')
          .expect(201)
      ).body.id,
    ).toBe(memberId);
    await api('member')
      .post('/teams/' + other.id + '/join')
      .expect(409);
    await api('outsider')
      .patch('/teams/' + team.id + '/memberships/' + memberId, {
        status: 'APPROVED',
      })
      .expect(403);
    await api('otherCommander')
      .patch('/teams/' + other.id + '/memberships/' + memberId, {
        status: 'APPROVED',
      })
      .expect(404);
    const pending = (await api('commander').get('/teams/me').expect(200)).body
      .commandedTeam.memberships;
    expect(pending.some((m: any) => m.id === memberId)).toBe(true);
    expect(JSON.stringify(pending)).not.toMatch(
      /phone|email|password|birthDate|cars/,
    );
    const publicBefore = (
      await request(app.getHttpServer()).get('/teams/public').expect(200)
    ).body.find((t: any) => t.id === team.id);
    expect(publicBefore.members).toHaveLength(0);
    await api('commander')
      .patch('/teams/' + team.id + '/memberships/' + memberId, {
        status: 'APPROVED',
      })
      .expect(200);
    await api('commander')
      .patch('/teams/' + team.id + '/memberships/' + memberId, {
        status: 'REJECTED',
      })
      .expect(409);
  });
  it('hides private members and draft/in-review content, and permits publication only by ADMIN', async () => {
    const privateRequest = (
      await api('privateMember')
        .post('/teams/' + team.id + '/join')
        .expect(201)
    ).body;
    await api('commander')
      .patch('/teams/' + team.id + '/memberships/' + privateRequest.id, {
        status: 'APPROVED',
      })
      .expect(200);
    post = (
      await api('commander')
        .post('/teams/' + team.id + '/posts', payload)
        .expect(201)
    ).body;
    await api('commander')
      .patch('/teams/' + team.id + '/posts/' + post.id, {
        ...payload,
        status: 'PUBLISHED',
      })
      .expect(403);
    await api('judge')
      .patch('/teams/' + team.id + '/posts/' + post.id, {
        ...payload,
        status: 'PUBLISHED',
      })
      .expect(403);
    await api('otherCommander')
      .patch('/teams/' + other.id + '/posts/' + post.id, payload)
      .expect(404);
    const before = (
      await request(app.getHttpServer()).get('/teams/public').expect(200)
    ).body;
    expect(before.find((t: any) => t.id === team.id).posts).toHaveLength(0);
    expect(JSON.stringify(before)).not.toContain(people.privateMember);
    await api('admin')
      .patch('/teams/' + team.id + '/posts/' + post.id, {
        ...payload,
        status: 'PUBLISHED',
      })
      .expect(200);
    await api('commander')
      .patch('/teams/' + team.id + '/posts/' + post.id, {
        ...payload,
        body: 'unreviewed edit',
      })
      .expect(403);
    const after = (
      await request(app.getHttpServer()).get('/teams/public').expect(200)
    ).body.find((t: any) => t.id === team.id);
    expect(after.members.map((p: any) => p.id)).toContain(people.member);
    expect(after.posts[0].body).toBe(payload.body);
    expect(JSON.stringify(after)).not.toMatch(
      /authorUserId|commanderUserId|password|phone|email/,
    );
    await api('admin')
      .patch('/teams/' + team.id + '/posts/' + post.id, {
        ...payload,
        status: 'DRAFT',
      })
      .expect(200);
    const unpublished = (
      await request(app.getHttpServer()).get('/teams/public').expect(200)
    ).body.find((t: any) => t.id === team.id);
    expect(unpublished.posts).toHaveLength(0);
    await api('commander')
      .patch('/teams/' + team.id + '/posts/' + post.id, payload)
      .expect(200);
    await api('admin')
      .patch('/teams/' + team.id + '/posts/' + post.id, {
        ...payload,
        status: 'PUBLISHED',
      })
      .expect(200);
    await api('commander')
      .patch('/teams/' + team.id + '/memberships/' + privateRequest.id, {
        status: 'LEFT',
      })
      .expect(200);
  });
  it('preserves archive strings through rename, archive, leave and commander revocation', async () => {
    await api('commander')
      .patch('/teams/' + team.id, { description: 'Own team description' })
      .expect(200);
    await api('admin')
      .patch('/teams/' + team.id, { name: 'Renamed ' + tag, isActive: false })
      .expect(200);
    await api('commander')
      .patch('/teams/' + team.id, { description: 'Archived change' })
      .expect(403);
    await api('outsider')
      .post('/teams/' + team.id + '/join')
      .expect(404);
    await api('member').post('/teams/me/leave').expect(201);
    await api('admin')
      .patch('/teams/' + team.id, { isActive: true, commanderUserId: null })
      .expect(200);
    await api('commander')
      .patch('/teams/' + team.id, { description: 'Revoked change' })
      .expect(403);
    expect(
      (await db.participant.findUniqueOrThrow({ where: { id: people.member } }))
        .team,
    ).toBe(legacy);
    const archives = (
      await request(app.getHttpServer()).get('/teams/public').expect(200)
    ).body.find((t: any) => t.name === legacy);
    expect(archives.id).toBeNull();
    expect(
      archives.historicalMembers.some((p: any) => p.id === people.member),
    ).toBe(true);
    expect(
      await db.auditLog.count({ where: { entity: 'Team', entityId: team.id } }),
    ).toBeGreaterThan(8);
  });
  it('serializes concurrent membership requests without creating two memberships or overwriting archive text', async () => {
    const results = await Promise.all([
      api('outsider').post('/teams/' + team.id + '/join'),
      api('outsider').post('/teams/' + other.id + '/join'),
    ]);
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    expect(
      await db.teamMembership.count({
        where: { participantId: people.outsider },
      }),
    ).toBe(1);
    expect(
      (
        await db.participant.findUniqueOrThrow({
          where: { id: people.outsider },
        })
      ).team,
    ).toBe(legacy);
  });
  it('rejects unknown and invalid fields and database-invalid states', async () => {
    await api('admin').post('/teams', { name: '   ' }).expect(400);
    await api('admin')
      .patch('/teams/' + team.id, {
        description: 'x',
        participantId: people.outsider,
      })
      .expect(400);
    await api('admin')
      .post('/teams/' + team.id + '/posts', { ...payload, status: 'APPROVED' })
      .expect(400);
    await expect(
      db.teamPost.create({
        data: {
          teamId: team.id,
          authorUserId: users.admin,
          kind: 'NEWS',
          title: 'Invalid',
          body: 'Invalid',
          status: 'PUBLISHED',
        },
      }),
    ).rejects.toThrow();
    await db.user.update({
      where: { id: users.judge },
      data: { emailVerifiedAt: null },
    });
    await api('judge').get('/teams/me').expect(401);
    await db.user.update({
      where: { id: users.outsider },
      data: { isActive: false },
    });
    await api('outsider').get('/teams/me').expect(401);
  });
});
