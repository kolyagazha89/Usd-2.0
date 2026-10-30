import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ExpressAdapter } from '@nestjs/platform-express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { MailService } from '../src/mail/mail.service';
import { EmailNotificationsService } from '../src/mail/email-notifications.service';
import type { CreateConfigurationDto } from '../src/configurations/dto/create-configuration.dto';

// Acceptance: USD_MASTER_PLAN sections 7–10 and 14. Run only after migrations on
// a disposable PostgreSQL 18 database. No archive import/replay or real accounts.
// MailService is replaced with a capture: register, verification tokens, login, JWT/RBAC,
// validation, services, transactions, ranking and records use production code.
// This is API acceptance evidence, not browser/device QA, mail rendering or inbox delivery proof.
const integration =
  process.env.USD_COMPETITION_JOURNEY_TEST === '1' ? describe : describe.skip;

type Member = {
  token: string;
  userId: string;
  email: string;
  participantId: string;
  carId: string;
  configurationId: string;
  versionId: string;
};

class CapturedMail {
  verification = new Map<string, string>();
  async sendVerificationEmail(email: string, token: string) {
    if (!email.endsWith('@journey.invalid'))
      throw Error('Non-synthetic mail recipient');
    this.verification.set(email, token);
  }
  async sendNotificationEmail(message: { to: string }) {
    if (!message.to.endsWith('@journey.invalid'))
      throw Error('Non-synthetic mail recipient');
  }
}

integration('live competition journey on isolated PostgreSQL 18', () => {
  let app: INestApplication;
  let db: PrismaService;
  let participant: Member, neighbour: Member, admin: Member, judge: Member;
  let seasonId: string;
  let classIds: string[];
  let stageNumber = 0;
  const tag = randomUUID();
  const mail = new CapturedMail();
  const notificationTasks = new Set<Promise<unknown>>();
  const password = 'Synthetic-journey-password-2026!';
  const legalVersion = 'journey-' + tag;
  const catalog = [
    ['head', 'HEAD_UNIT', 'Head unit'],
    ['front', 'AUDIO_COMPONENT', 'Front speakers'],
    ['horn', 'AUDIO_COMPONENT', 'Front horns'],
    ['sub', 'SUBWOOFER', 'Subwoofer'],
    ['rear', 'AUDIO_COMPONENT', 'Rear speakers'],
    ['amp', 'AMPLIFIER', 'Amplifier'],
  ].map(([id, category, model]) => ({
    id: 'journey-' + id,
    category,
    brand: 'Synthetic USD',
    model,
    isActive: true,
  }));

  const configuration = (
    name = 'FRONT SUB REAR',
    subQuantity = 2,
  ): CreateConfigurationDto =>
    ({
      name,
      vibrationIsolation: 'Synthetic insulation',
      additionalDescription: 'Synthetic competition configuration',
      headUnits: [
        {
          catalogEntryId: 'journey-head',
          brand: 'Synthetic USD',
          model: 'Head unit',
          direction: 'FRONT',
        },
      ],
      audioComponents: [
        {
          catalogEntryId: 'journey-front',
          brand: 'Synthetic USD',
          model: 'Front speakers',
          quantity: 4,
          type: 'MIDRANGE',
          direction: 'FRONT',
        },
        {
          catalogEntryId: 'journey-horn',
          brand: 'Synthetic USD',
          model: 'Front horns',
          quantity: 2,
          type: 'HORN',
          direction: 'FRONT',
        },
        {
          catalogEntryId: 'journey-sub',
          brand: 'Synthetic USD',
          model: 'Subwoofer',
          quantity: subQuantity,
          type: 'SUBWOOFER',
          direction: 'SUB',
        },
        {
          catalogEntryId: 'journey-rear',
          brand: 'Synthetic USD',
          model: 'Rear speakers',
          quantity: 2,
          type: 'MIDBASS',
          direction: 'REAR',
        },
      ],
      amplifiers: [
        {
          catalogEntryId: 'journey-amp',
          brand: 'Synthetic USD',
          model: 'Amplifier',
          quantity: 1,
          direction: 'FRONT',
          componentLinks: [
            { componentId: '0', quantity: 4 },
            { componentId: '1', quantity: 2 },
          ],
        },
        {
          catalogEntryId: 'journey-amp',
          brand: 'Synthetic USD',
          model: 'Amplifier',
          quantity: 1,
          direction: 'SUB',
          componentLinks: [{ componentId: '2', quantity: subQuantity }],
        },
        {
          catalogEntryId: 'journey-amp',
          brand: 'Synthetic USD',
          model: 'Amplifier',
          quantity: 1,
          direction: 'REAR',
          componentLinks: [{ componentId: '3', quantity: 2 }],
        },
      ],
      batteries: [
        { brand: 'JOURNEY-AGM', model: 'Synthetic 100 Ah', quantity: 2 },
      ],
      generators: [
        { brand: 'Synthetic USD', model: 'Synthetic 200 A', quantity: 1 },
      ],
    }) as CreateConfigurationDto;

  const api = (
    method: 'get' | 'post' | 'patch' | 'put' | 'delete',
    path: string,
    member?: Member,
  ) => {
    if (!path.startsWith('/') || path.startsWith('//'))
      throw Error('Only local API paths allowed');
    const call = request(app.getHttpServer())[method](path);
    return member ? call.auth(member.token, { type: 'bearer' }) : call;
  };

  const registrationBody = (
    stageId: string,
    member: Member,
    selected = classIds,
  ) => ({
    stageId,
    carId: member.carId,
    configurationVersionId: member.versionId,
    classIds: selected,
    rulesAccepted: true,
  });

  const createMember = async (index: number): Promise<Member> => {
    const email = `${index}-${tag}@journey.invalid`;
    await api('post', '/auth/register')
      .send({ email, password, privacyConsent: true, termsAccepted: true })
      .expect(201);
    // Mail capture holds the actual one-time token generated by AuthService.
    await api('post', '/auth/login').send({ email, password }).expect(401);
    const token = mail.verification.get(email);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    await api('post', '/auth/verify-email').send({ token }).expect(201);
    await api('post', '/auth/verify-email').send({ token }).expect(400);
    const login = await api('post', '/auth/login')
      .send({ email, password })
      .expect(201);
    expect(login.body.accessToken).toEqual(expect.any(String));
    expect(login.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('HttpOnly')]),
    );
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user.emailVerifiedAt).not.toBeNull();
    const member = {
      token: login.body.accessToken,
      userId: user.id,
      email,
    } as Member;
    const profile = await api('post', '/participants/me', member)
      .send({
        lastName: 'Синтетический',
        firstName: 'Участник ' + index,
        city: 'Тестовый город',
        phone: '+79991234567',
        birthDate: '1990-01-01',
        isPublic: true,
      })
      .expect(201);
    member.participantId = profile.body.id;
    const car = await api('post', '/participants/me/cars', member)
      .send({
        brand: 'Synthetic USD',
        model: 'Journey ' + index,
        registrationCountry: 'US',
        registrationNumber: randomUUID()
          .replace(/-/g, '')
          .slice(0, 8)
          .toUpperCase(),
        isPublic: true,
      })
      .expect(201);
    member.carId = car.body.id;
    const build = await api(
      'post',
      `/cars/${member.carId}/configurations`,
      member,
    )
      .send(configuration())
      .expect(201);
    member.configurationId = build.body.id;
    member.versionId = build.body.versions[0].id;
    return member;
  };

  const createStage = async (limits?: number) => {
    const stage = await api('post', '/stages', admin)
      .send({
        seasonId,
        stageNumber: ++stageNumber,
        name: `Synthetic journey ${tag} ${stageNumber}`,
        date: new Date(Date.now() + 7 * 86400000).toISOString(),
        city: 'Тестовый город',
        status: 'PUBLISHED',
        registrationOpen: true,
      })
      .expect(201);
    for (const classId of classIds) {
      await api('post', `/stages/${stage.body.id}/classes`, admin)
        .send({ classId })
        .expect(201);
      if (limits !== undefined) {
        await api('patch', `/stages/${stage.body.id}/classes/${classId}`, admin)
          .send({ participantLimit: limits })
          .expect(200);
      }
    }
    return stage.body.id as string;
  };

  beforeAll(async () => {
    // Validate before constructing Prisma or the application. Refuse remote hosts,
    // arbitrary database names, alternate schemas, and URL connection overrides.
    const url = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid');
    if (
      !['postgresql:', 'postgres:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !/^\/usd_identity_[a-z0-9_]+$/.test(url.pathname) ||
      url.search ||
      url.hash
    ) {
      throw Error(
        'Only an isolated localhost usd_identity_* test database without URL options is allowed',
      );
    }
    process.env.JWT_SECRET =
      'isolated-competition-journey-secret-32-bytes-minimum';
    process.env.FRONTEND_URL = 'http://127.0.0.1:3000';
    process.env.PUBLIC_API_URL = 'http://127.0.0.1:3001';
    db = new PrismaService();
    await db.$connect();
    const [{ version }] = await db.$queryRaw<
      Array<{ version: string }>
    >`SELECT current_setting('server_version') AS version`;
    expect(version).toMatch(/^18\./);
    // AppModule also contains import recovery workers. Refuse any archive data
    // or non-synthetic account before boot so this suite cannot resume an import
    // or notify an existing user, even in a mistakenly selected local test DB.
    expect(await db.historicalImportBatch.count()).toBe(0);
    expect(await db.registration.count({ where: { source: 'IMPORT' } })).toBe(
      0,
    );
    expect(await db.result.count({ where: { isHistorical: true } })).toBe(0);
    expect(
      await db.user.count({
        where: { NOT: { email: { endsWith: '@journey.invalid' } } },
      }),
    ).toBe(0);
    const settings = {
      branding: {},
      homepage: {},
      stream: {},
      liveResults: {},
      navigation: {},
      social: {},
      seo: {},
      footer: {},
      contacts: { email: 'organizer@journey.invalid' },
      legal: {
        legalApproved: true,
        legalVersion,
        ipName: 'Synthetic organizer',
        operatorAddress: 'Synthetic address',
        personalDataEmail: 'privacy@journey.invalid',
        privacyText: 'Synthetic privacy document',
        consentText: 'Synthetic consent document',
        termsText: 'Synthetic terms document',
      },
      registration: {
        rulesDocument: {
          published: {
            id: 'rules-' + tag,
            blocks: [{ type: 'paragraph', text: 'Synthetic rules' }],
          },
        },
      },
      catalogs: {
        componentModels: catalog,
        batteryTypes: [{ code: 'JOURNEY-AGM', isActive: true }],
      },
    };
    await db.siteSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...settings },
      update: settings,
    });
    // Import after assigning the isolated JWT secret: AuthModule reads it at load.
    const { AppModule } = await import('../src/app.module.js');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();
    app = module.createNestApplication(new ExpressAdapter());
    // Observe the original promises without replacing notification behavior.
    // Production intentionally launches these jobs after the response; await
    // them before closing Prisma so unfinished jobs cannot reopen its pool.
    const notifications = app.get(EmailNotificationsService);
    for (const name of [
      'processReminders',
      'registrationOpened',
      'registrationConfirmed',
      'registrationCancelled',
      'stageChanged',
      'inspectionChanged',
      'resultsPublished',
      'recordSet',
    ] as const) {
      const original = notifications[name].bind(notifications) as (
        ...args: unknown[]
      ) => Promise<unknown>;
      Object.defineProperty(notifications, name, {
        value: (...args: unknown[]) => {
          const task = original(...args);
          notificationTasks.add(task);
          void task
            .finally(() => notificationTasks.delete(task))
            .catch(() => undefined);
          return task;
        },
      });
    }
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalGuards(app.get(JwtAuthGuard), app.get(RolesGuard));
    // Bind explicitly to loopback; supertest must never listen on all interfaces.
    await app.listen(0, '127.0.0.1');
    participant = await createMember(1);
    neighbour = await createMember(2);
    admin = await createMember(3);
    judge = await createMember(4);
    // The sole privileged bootstrap is a fresh synthetic ADMIN fixture. All
    // subsequent role creation/assignment and operations go through guarded HTTP.
    await db.user.update({
      where: { id: admin.userId },
      data: { role: 'ADMIN' },
    });
    const custom = await api('post', '/auth/admin/roles', admin)
      .send({
        key: 'journey-' + tag,
        name: 'Synthetic journey judge',
        permissions: {
          registrations: ['view', 'create'],
          inspections: ['view', 'create', 'update'],
          results: ['view', 'create', 'update', 'delete'],
        },
      })
      .expect(201);
    await api('patch', `/auth/admin/users/${judge.userId}/custom-role`, admin)
      .send({ customRoleId: custom.body.id })
      .expect(200);
    // Login again proves staff credentials still use the real authentication flow.
    for (const member of [admin, judge]) {
      const login = await api('post', '/auth/login')
        .send({ email: member.email, password })
        .expect(201);
      member.token = login.body.accessToken;
    }
    const season = await db.season.create({
      data: {
        year: 10000 + Math.floor(Math.random() * 100000000),
        name: 'Synthetic journey ' + tag,
        status: 'ACTIVE',
      },
    });
    seasonId = season.id;
    classIds = [];
    for (const name of ['SPL', 'BFSPL', 'BDW SPL', 'BassRace']) {
      const direction = await db.direction.create({ data: { name } });
      const cls = await db.class.create({
        data: {
          directionId: direction.id,
          code: name.replace(/ /g, '') + '-' + tag,
          name: name + ' synthetic',
          unit: 'DB',
        },
      });
      classIds.push(cls.id);
    }
  }, 120000);

  afterAll(async () => {
    while (notificationTasks.size) {
      await Promise.allSettled(notificationTasks);
    }
    await app?.close();
    await db?.$disconnect();
    // Keep synthetic rows for failure diagnosis; dispose of the dedicated DB or
    // container outside this suite. Never truncate or delete neighbouring data.
  });

  it('takes a participant through inspection, judging, publication and immutable personal history', async () => {
    const stageId = await createStage();
    const registration = (
      await api('post', '/registrations/me', participant)
        .send(registrationBody(stageId, participant))
        .expect(201)
    ).body;
    expect(registration).toMatchObject({
      participantId: participant.participantId,
      carId: participant.carId,
      configurationVersionId: participant.versionId,
      source: 'PRE_REGISTRATION',
      status: 'ACTIVE',
      participantNumber: 1,
      privacyConsentVersion: 'privacy-v' + legalVersion,
      termsVersion: 'terms-v' + legalVersion,
      rulesVersion: 'rules-' + tag,
    });
    expect(registration.classes).toHaveLength(4);
    const snapshot = registration.configurationSnapshot;
    expect(
      snapshot.audioComponents
        .map((row: { direction: string }) => row.direction)
        .sort(),
    ).toEqual(['FRONT', 'FRONT', 'REAR', 'SUB']);
    for (const amp of snapshot.amplifiers) {
      for (const link of amp.componentLinks) {
        expect(snapshot.audioComponents).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: link.componentId,
              direction: amp.direction,
            }),
          ]),
        );
      }
    }
    const resultBody = {
      registrationId: registration.id,
      registrationClassId: registration.classes.find(
        (row: { classId: string }) => row.classId === classIds[0],
      ).id,
      value: 151.125,
      confirmed: true,
    };
    await api('post', '/results', participant).send(resultBody).expect(403);
    await api('post', '/results', judge).send(resultBody).expect(409);
    await api('post', '/inspections', judge)
      .send({ registrationId: registration.id, status: 'FAILED' })
      .expect(400);
    const failed = (
      await api('post', '/inspections', judge)
        .send({
          registrationId: registration.id,
          status: 'FAILED',
          notes: 'Synthetic loose battery clamp',
        })
        .expect(201)
    ).body;
    await api('post', '/results', judge).send(resultBody).expect(409);
    await api('patch', `/inspections/${failed.id}`, judge)
      .send({ status: 'PASSED', notes: 'Synthetic clamp corrected' })
      .expect(200);
    await api('post', '/results', judge)
      .send({ ...resultBody, confirmed: false })
      .expect(409);
    const result = (
      await api('post', '/results', judge).send(resultBody).expect(201)
    ).body;
    expect(result).toMatchObject({
      value: '151.125',
      unit: 'DB',
      place: 1,
      isHistorical: false,
      createdByUserId: judge.userId,
      registrationId: registration.id,
      registrationClassId: resultBody.registrationClassId,
    });
    await api('post', '/results', judge).send(resultBody).expect(409);
    await api('patch', `/results/${result.id}`, judge)
      .send({ value: 152 })
      .expect(403);
    await api('post', `/results/${result.id}/delete`, judge)
      .send({ confirmed: true, reason: 'Synthetic unauthorized deletion' })
      .expect(403);
    await api('get', `/results/${result.id}`).expect(404);
    await api('get', `/results/stage/${stageId}`).expect(404);

    // BassRace remains a result but never creates a USD record.
    const bassRaceClass = registration.classes.find(
      (row: { classId: string }) => row.classId === classIds[3],
    );
    await api('post', '/inspections/class', judge)
      .send({ registrationClassId: bassRaceClass.id, status: 'PASSED' })
      .expect(201);
    const bassRace = (
      await api('post', '/results', judge)
        .send({
          ...resultBody,
          registrationClassId: bassRaceClass.id,
          value: 139.9,
        })
        .expect(201)
    ).body;
    expect(await db.record.count({ where: { resultId: bassRace.id } })).toBe(0);
    expect(await db.record.count({ where: { resultId: result.id } })).toBe(1);
    await api('post', `/stages/${stageId}/results-publication`, judge)
      .send({ published: true, confirmed: true })
      .expect(403);
    await api('post', `/stages/${stageId}/results-publication`, admin)
      .send({ published: true, confirmed: true })
      .expect(201);
    const visible = (await api('get', `/results/${result.id}`).expect(200))
      .body;
    expect(visible.registration).toMatchObject({
      id: registration.id,
      participant: { id: participant.participantId },
      car: { id: participant.carId },
    });
    expect(JSON.stringify(visible)).not.toContain(participant.email);
    expect(visible.registration.participant).not.toHaveProperty('phone');
    expect(visible.registration.car).not.toHaveProperty('registrationNumber');
    expect(
      (await api('get', `/results/stage/${stageId}`).expect(200)).body,
    ).toHaveLength(2);
    expect(
      (await api('get', `/records/class/${classIds[0]}`).expect(200)).body,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resultId: result.id }),
      ]),
    );
    expect(
      (await api('get', `/records/class/${classIds[3]}`).expect(200)).body,
    ).toEqual([]);

    const edited = (
      await api(
        'put',
        `/configurations/${participant.configurationId}`,
        participant,
      )
        .send(configuration('Next competition build', 3))
        .expect(200)
    ).body;
    expect(edited.currentVersion).toBe(2);
    const original = (
      await api(
        'get',
        `/configurations/${participant.configurationId}/versions/1`,
        participant,
      ).expect(200)
    ).body;
    expect(
      original.audioComponents.find(
        (row: { direction: string }) => row.direction === 'SUB',
      ).quantity,
    ).toBe(2);
    const personalHistory = (
      await api('get', '/registrations/me', participant).expect(200)
    ).body;
    const performance = personalHistory.find(
      (row: { id: string }) => row.id === registration.id,
    );
    expect(performance.configurationVersionId).toBe(participant.versionId);
    expect(performance.configurationSnapshot).toEqual(snapshot);
    expect(performance.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: result.id, value: '151.125' }),
      ]),
    );
    expect(
      (
        await api(
          'get',
          `/participants/${participant.participantId}`,
          neighbour,
        ).expect(200)
      ).body.id,
    ).toBe(participant.participantId);
    const publicProfile = (
      await api('get', `/participants/${participant.participantId}`).expect(200)
    ).body;
    expect(publicProfile.registrations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: registration.id }),
      ]),
    );
    expect(publicProfile).not.toHaveProperty('phone');
    expect(publicProfile).not.toHaveProperty('birthDate');
    expect(publicProfile).not.toHaveProperty('user');
    expect(publicProfile.cars[0]).not.toHaveProperty('registrationNumber');

    await api('patch', `/cars/${participant.carId}`, participant)
      .send({ isPublic: false })
      .expect(200);
    await api('patch', '/participants/me', participant)
      .send({ isPublic: false })
      .expect(200);
    await api('get', `/participants/${participant.participantId}`).expect(404);
    const redacted = (await api('get', `/results/${result.id}`).expect(200))
      .body;
    expect(redacted.registration.participant).toMatchObject({
      lastName: 'Участник скрыт',
      firstName: '',
    });
    expect(redacted.registration.car).toMatchObject({
      brand: 'Автомобиль скрыт',
      model: '',
    });
    expect(
      (
        await api('get', '/registrations/me', participant).expect(200)
      ).body.find((row: { id: string }) => row.id === registration.id)
        .configurationSnapshot,
    ).toEqual(snapshot);
    const persisted = await db.result.findUniqueOrThrow({
      where: { id: result.id },
    });
    expect(persisted.value.toNumber()).toBe(151.125);
    expect(
      await db.auditLog.count({
        where: {
          userId: judge.userId,
          action: 'RESULT_CREATED',
          entityId: result.id,
        },
      }),
    ).toBe(1);
    await api('patch', '/participants/me', participant)
      .send({ isPublic: true })
      .expect(200);
    await api('patch', `/cars/${participant.carId}`, participant)
      .send({ isPublic: true })
      .expect(200);
  }, 60000);

  it.each(['participant', 'admin', 'judge'] as const)(
    '%s can use their own cabinet, car, configuration and registration',
    async (kind) => {
      const member = { participant, admin, judge }[kind];
      expect(
        (await api('get', '/participants/me', member).expect(200)).body
          .participant.id,
      ).toBe(member.participantId);
      expect(
        (await api('get', '/participants/me/cars', member).expect(200)).body,
      ).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: member.carId })]),
      );
      await api('patch', '/participants/me', member)
        .send({ city: 'Кабинет ' + kind })
        .expect(200);
      await api('patch', `/cars/${member.carId}`, member)
        .send({ color: 'Graphite' })
        .expect(200);
      const ownCar = (
        await api('post', '/participants/me/cars', member)
          .send({
            brand: 'Synthetic USD',
            model: 'Personal ' + kind,
            registrationCountry: 'US',
            registrationNumber: randomUUID()
              .replace(/-/g, '')
              .slice(0, 8)
              .toUpperCase(),
            isPublic: true,
          })
          .expect(201)
      ).body;
      expect(ownCar.participantId).toBe(member.participantId);
      const build = (
        await api('post', `/cars/${ownCar.id}/configurations`, member)
          .send(configuration('Personal cabinet ' + kind))
          .expect(201)
      ).body;
      const edited = (
        await api('put', `/configurations/${build.id}`, member)
          .send(configuration('Personal cabinet updated ' + kind, 3))
          .expect(200)
      ).body;
      expect(edited.currentVersion).toBe(2);
      const stageId = await createStage();
      const body = {
        ...registrationBody(stageId, member, [classIds[0]]),
        carId: ownCar.id,
        configurationVersionId: edited.versions[0].id,
        participantId: neighbour.participantId,
        source: 'IMPORT',
      };
      const registration = (
        await api('post', '/registrations/me', member).send(body).expect(201)
      ).body;
      // Even permanent ADMIN and a judge cannot override personal endpoint scope.
      expect(registration).toMatchObject({
        participantId: member.participantId,
        carId: ownCar.id,
        source: 'PRE_REGISTRATION',
      });
      expect(
        (await api('get', '/registrations/me', member).expect(200)).body,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: registration.id }),
        ]),
      );
      await api(
        'delete',
        `/registrations/me/${registration.id}`,
        member,
      ).expect(200);
      expect(
        await db.registrationNumber.count({
          where: { registrationId: registration.id },
        }),
      ).toBe(0);
    },
    30000,
  );

  it('enforces ownership and judge permission boundaries through the real guards', async () => {
    await api('get', '/participants/me').expect(401);
    await api('get', '/participants/me')
      .auth('invalid', { type: 'bearer' })
      .expect(401);
    for (const member of [participant, judge]) {
      await api('patch', `/cars/${neighbour.carId}`, member)
        .send({ model: 'Stolen' })
        .expect(403);
      await api('delete', `/cars/${neighbour.carId}`, member).expect(403);
      await api(
        'get',
        `/configurations/${neighbour.configurationId}`,
        member,
      ).expect(403);
      await api('put', `/configurations/${neighbour.configurationId}`, member)
        .send(configuration('Stolen'))
        .expect(403);
      await api('post', `/cars/${neighbour.carId}/configurations`, member)
        .send(configuration('Stolen'))
        .expect(403);
    }
    const stageId = await createStage();
    const registration = (
      await api('post', '/registrations/me', neighbour)
        .send(registrationBody(stageId, neighbour))
        .expect(201)
    ).body;
    await api('get', `/registrations/${registration.id}`, participant).expect(
      403,
    );
    for (const member of [participant, admin, judge]) {
      await api(
        'delete',
        `/registrations/me/${registration.id}`,
        member,
      ).expect(403);
      const rejected = await api('post', '/registrations/me', member)
        .send(registrationBody(stageId, neighbour))
        .expect(400);
      expect(rejected.body.message).toContain('не принадлежит');
    }
    await api('get', '/auth/admin/users', judge).expect(403);
    await api('patch', `/auth/admin/users/${judge.userId}/role`, judge)
      .send({ role: 'ADMIN' })
      .expect(403);
    await api('patch', `/stages/${stageId}`, judge)
      .send({ name: 'Unauthorized' })
      .expect(403);
    expect(
      (
        await db.registration.findUniqueOrThrow({
          where: { id: registration.id },
        })
      ).status,
    ).toBe('ACTIVE');
  }, 30000);

  it('rejects incomplete directional configurations, invalid quantities and class overflow without partial registrations', async () => {
    const stageId = await createStage(1);
    for (const [direction, selectedClass, message] of [
      ['SUB', classIds[0], 'сабвуфер'],
      ['FRONT', classIds[1], 'фронтальную'],
      ['REAR', classIds[2], 'тыловую'],
    ]) {
      const build = configuration('Incomplete ' + direction);
      build.audioComponents = build.audioComponents.filter(
        (row) => row.direction !== direction,
      );
      build.amplifiers = [];
      const incomplete = (
        await api('post', `/cars/${neighbour.carId}/configurations`, neighbour)
          .send(build)
          .expect(201)
      ).body;
      const denied = await api('post', '/registrations/me', neighbour)
        .send({
          ...registrationBody(stageId, neighbour, [selectedClass]),
          configurationVersionId: incomplete.versions[0].id,
        })
        .expect(400);
      expect(denied.body.message).toContain(message);
    }
    const bad = configuration('Invalid quantity');
    bad.audioComponents[0].quantity = 0;
    await api('post', `/cars/${neighbour.carId}/configurations`, neighbour)
      .send(bad)
      .expect(400);
    expect(
      await db.carConfiguration.count({
        where: { carId: neighbour.carId, name: 'Invalid quantity' },
      }),
    ).toBe(0);
    await api('post', '/registrations/me', neighbour)
      .send({ ...registrationBody(stageId, neighbour), rulesAccepted: false })
      .expect(400);
    expect(await db.registration.count({ where: { stageId } })).toBe(0);
    expect(await db.registrationNumber.count({ where: { stageId } })).toBe(0);
    await api('post', '/registrations/me', neighbour)
      .send(registrationBody(stageId, neighbour, [classIds[0]]))
      .expect(201);
    const rejected = await api('post', '/registrations/me', judge)
      .send(registrationBody(stageId, judge, [classIds[0]]))
      .expect(409);
    expect(rejected.body.code).toBe('STAGE_CLASS_PARTICIPANT_LIMIT_REACHED');
    expect(await db.registration.count({ where: { stageId } })).toBe(1);
    expect(await db.registrationNumber.count({ where: { stageId } })).toBe(1);
  }, 30000);

  it('releases cancelled sticker numbers and re-registers without duplicate active reservations', async () => {
    const stageId = await createStage();
    const first = (
      await api('post', '/registrations/me', neighbour)
        .send(registrationBody(stageId, neighbour, [classIds[0]]))
        .expect(201)
    ).body;
    expect(first.participantNumber).toBe(1);
    await api('delete', `/registrations/me/${first.id}`, neighbour).expect(200);
    expect(await db.registrationNumber.count({ where: { stageId } })).toBe(0);
    const second = (
      await api('post', '/registrations/me', judge)
        .send(registrationBody(stageId, judge, [classIds[0]]))
        .expect(201)
    ).body;
    expect(second.participantNumber).toBe(1);
    const again = (
      await api('post', '/registrations/me', neighbour)
        .send(registrationBody(stageId, neighbour, [classIds[0]]))
        .expect(201)
    ).body;
    expect(again.id).toBe(first.id);
    expect(again.participantNumber).toBe(2);
    expect(
      await db.registration.count({ where: { stageId, status: 'ACTIVE' } }),
    ).toBe(2);
    expect(
      (
        await db.registrationNumber.findMany({
          where: { stageId },
          orderBy: { number: 'asc' },
        })
      ).map((row) => row.number),
    ).toEqual([1, 2]);
  }, 30000);
});
