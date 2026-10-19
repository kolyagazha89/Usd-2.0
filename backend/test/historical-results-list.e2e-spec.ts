import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { RecordsService } from '../src/records/records.service';
import { ResultsRankingService } from '../src/results/results-ranking.service';
import { HistoricalResultsService } from '../src/historical-results/historical-results.service';
import type { AuthenticatedRequest } from '../src/auth/authenticated-request';
const integration =
  process.env.USD_HISTORICAL_LIST_TEST === '1' ? describe : describe.skip;
integration(
  'bounded history list and chunked confirmation on PostgreSQL',
  () => {
    let db: PrismaService,
      service: HistoricalResultsService,
      request: AuthenticatedRequest,
      year: number;
    beforeAll(async () => {
      const url = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid');
      if (
        !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        !url.pathname.startsWith('/usd_identity_')
      )
        throw Error('Isolated localhost usd_identity_* database required');
      db = new PrismaService();
      await db.$connect();
      service = new HistoricalResultsService(
        db,
        new RecordsService(db),
        new ResultsRankingService(db),
      );
      const tag = randomUUID();
      year = 7000 + Math.floor(Math.random() * 2000);
      while (await db.season.findUnique({ where: { year } })) year++;
      const admin = await db.user.create({
        data: {
          email: tag + '@history-test.invalid',
          passwordHash: 'unused-local',
          role: 'ADMIN',
        },
      });
      request = {
        user: { sub: admin.id, role: 'ADMIN' },
      } as AuthenticatedRequest;
      const season = await db.season.create({
        data: { year, name: 'List payload fixture' },
      });
      const direction = await db.direction.create({
        data: { name: 'List ' + tag },
      });
      const cls = await db.class.create({
        data: {
          directionId: direction.id,
          code: 'LIST-' + tag,
          name: 'List test',
          unit: 'DB',
        },
      });
      const stage = await db.stage.create({
        data: {
          seasonId: season.id,
          stageNumber: 1,
          name: 'History list fixture',
          city: 'Test',
          date: new Date(),
          status: 'PUBLISHED',
          rulesSnapshot: { document: 'RULES'.repeat(200000) },
          stageClasses: { create: { classId: cls.id } },
        },
      });
      const participant = await db.participant.create({
        data: { firstName: 'List', lastName: 'Fixture', phone: '+70000000000' },
      });
      for (let i = 1; i <= 125; i++) {
        const car = await db.car.create({
          data: {
            participantId: participant.id,
            brand: 'Test',
            model: String(i),
            registrationNumber: 'TEST' + tag + i,
            configurations: {
              create: { name: 'Saved', versions: { create: { version: 1 } } },
            },
          },
          include: { configurations: { include: { versions: true } } },
        });
        const reg = await db.registration.create({
          data: {
            stageId: stage.id,
            participantId: participant.id,
            carId: car.id,
            configurationVersionId: car.configurations[0].versions[0].id,
            configurationSnapshot: { equipment: 'SAVED'.repeat(5000) },
            participantNumber: i,
            source: 'IMPORT',
          },
        });
        const number = await db.registrationNumber.create({
          data: { stageId: stage.id, registrationId: reg.id, number: i },
        });
        const rc = await db.registrationClass.create({
          data: {
            registrationId: reg.id,
            classId: cls.id,
            numberId: number.id,
          },
        });
        await db.result.create({
          data: {
            registrationId: reg.id,
            registrationClassId: rc.id,
            value: 100 + i / 100,
            unit: 'DB',
            isHistorical: true,
            verificationStatus: 'PENDING',
          },
        });
      }
    }, 60000);
    afterAll(async () => {
      await db?.$disconnect();
    });
    it('paginates a large archive without rules, configuration snapshots or private participant fields', async () => {
      const first = await service.findAllAdmin({ season: String(year) }),
        second = await service.findAllAdmin({
          season: String(year),
          page: '2',
        });
      expect(first.items).toHaveLength(50);
      expect(second.items).toHaveLength(50);
      expect(first.total).toBe(125);
      expect(first.pending).toBe(125);
      expect(
        new Set([...first.items, ...second.items].map((r) => r.id)).size,
      ).toBe(100);
      const payload = JSON.stringify(first);
      expect(Buffer.byteLength(payload)).toBeLessThan(100000);
      expect(payload).not.toContain('RULES');
      expect(payload).not.toContain('SAVED');
      expect(payload).not.toContain('+70000000000');
    });
    it('confirms the complete season in two bounded requests with accurate remaining counts', async () => {
      const first = await service.verifyAll(request, String(year));
      expect(first.processed).toBe(100);
      expect(first.remaining).toBe(25);
      const pending = await service.findAllAdmin({
        season: String(year),
        status: 'PENDING',
      });
      expect(pending.total).toBe(25);
      expect(pending.pending).toBe(25);
      const second = await service.verifyAll(request, String(year));
      expect(second.processed).toBe(25);
      expect(second.remaining).toBe(0);
      const final = await service.findAllAdmin({
        season: String(year),
        status: 'VERIFIED',
      });
      expect(final.total).toBe(125);
      expect(final.pending).toBe(0);
      expect((await service.verifyAll(request, String(year))).processed).toBe(
        0,
      );
    }, 60000);
  },
);
