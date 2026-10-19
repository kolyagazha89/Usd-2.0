import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { RecordsService } from '../src/records/records.service';
import { ResultsRankingService } from '../src/results/results-ranking.service';
import { MediaService } from '../src/media/media.service';
import { AdminDeletionService } from '../src/admin-deletion/admin-deletion.service';
import type { AuthenticatedRequest } from '../src/auth/authenticated-request';

const integration =
  process.env.USD_PERMANENT_DELETE_TEST === '1' ? describe : describe.skip;
integration('permanent admin deletion on isolated PostgreSQL', () => {
  let db: PrismaService,
    service: AdminDeletionService,
    records: RecordsService,
    request: AuthenticatedRequest,
    actorId: string;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid');
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !url.pathname.startsWith('/usd_identity_')
    )
      throw Error(
        'Only an isolated localhost usd_identity_* test database is allowed',
      );
    db = new PrismaService();
    await db.$connect();
    const actor = await db.user.create({
      data: {
        email: randomUUID() + '@delete-test.invalid',
        passwordHash: 'unused',
        role: 'ADMIN',
        emailVerifiedAt: new Date(),
      },
    });
    actorId = actor.id;
    request = {
      user: { sub: actor.id, role: 'ADMIN' },
      ip: 'isolated-deletion-test',
    } as AuthenticatedRequest;
    records = new RecordsService(db);
    service = new AdminDeletionService(
      db,
      records,
      new ResultsRankingService(db),
      new MediaService(db),
    );
  });
  afterAll(async () => {
    await db?.$disconnect();
  });
  const fixture = async () => {
    const tag = randomUUID();
    const season = await db.season.create({
      data: {
        year: 10000 + Math.floor(Math.random() * 100000000),
        name: 'Delete test ' + tag,
      },
    });
    const direction = await db.direction.create({
      data: { name: 'Deletion ' + tag },
    });
    const cls = await db.class.create({
      data: {
        directionId: direction.id,
        code: 'DELETE-' + tag,
        name: 'Delete integration',
        unit: 'DB',
      },
    });
    const stages = [];
    for (let i = 1; i <= 2; i++)
      stages.push(
        await db.stage.create({
          data: {
            seasonId: season.id,
            stageNumber: i,
            name: 'Удаляемый этап ' + tag + ' ' + i,
            date: new Date(),
            stageClasses: { create: { classId: cls.id } },
          },
        }),
      );
    const people = [];
    for (let i = 0; i < 2; i++) {
      const p = await db.participant.create({
        data: { lastName: 'Тестовый', firstName: 'Участник ' + i + ' ' + tag },
      });
      const user = await db.user.create({
        data: {
          email: i + '-' + tag + '@delete-test.invalid',
          passwordHash: 'unused',
          participantId: p.id,
        },
      });
      const car = await db.car.create({
        data: {
          participantId: p.id,
          brand: 'Test',
          model: 'Delete',
          registrationNumber: tag,
        },
      });
      const config = await db.carConfiguration.create({
        data: {
          carId: car.id,
          name: 'Saved',
          versions: {
            create: {
              version: 1,
              batteries: {
                create: { brand: 'Test', model: 'Battery', quantity: 1 },
              },
            },
          },
        },
        include: { versions: true },
      });
      const version = config.versions[0];
      const regs = [],
        results = [];
      for (const stage of stages) {
        const stageInspection = await db.participantStageInspection.create({
          data: {
            stageId: stage.id,
            participantId: p.id,
            status: 'PASSED',
            checkedByUserId: actorId,
          },
        });
        const reg = await db.registration.create({
          data: {
            stageId: stage.id,
            participantId: p.id,
            carId: car.id,
            configurationVersionId: version.id,
            configurationSnapshot: { version: 1 },
            participantNumber: i + 1,
            source: 'IMPORT',
            participantStageInspectionId: stageInspection.id,
            inspection: {
              create: { status: 'PASSED', checkedByUserId: actorId },
            },
            configurationConfirmation: {
              create: { versionId: version.id, confirmedByUserId: actorId },
            },
          },
        });
        const num = await db.registrationNumber.create({
          data: { stageId: stage.id, registrationId: reg.id, number: i + 1 },
        });
        const rc = await db.registrationClass.create({
          data: {
            registrationId: reg.id,
            classId: cls.id,
            numberId: num.id,
            inspection: {
              create: { status: 'PASSED', checkedByUserId: actorId },
            },
          },
        });
        const result = await db.result.create({
          data: {
            registrationId: reg.id,
            registrationClassId: rc.id,
            value: 160 - i * 10,
            unit: 'DB',
            place: i + 1,
            isBest: i === 0,
            isHistorical: true,
            verificationStatus: 'VERIFIED',
          },
        });
        await db.record.create({
          data: {
            classId: cls.id,
            seasonId: season.id,
            stageId: stage.id,
            participantId: p.id,
            carId: car.id,
            resultId: result.id,
            value: result.value,
            unit: 'DB',
            achievedAt: new Date(),
            isCurrent: i === 0,
          },
        });
        await db.importJob.create({
          data: {
            stageId: stage.id,
            status: 'COMMITTED',
            rows: {
              create: {
                type: 'RESULT',
                rowNumber: i + 1,
                rawData: { name: 'original' },
                participantId: p.id,
                registrationId: reg.id,
                status: 'COMMITTED',
              },
            },
          },
        });
        await db.emailNotificationLog.create({
          data: {
            eventKey: randomUUID(),
            type: 'TEST',
            recipient: user.email,
            stageId: stage.id,
            registrationId: reg.id,
          },
        });
        regs.push(reg);
        results.push(result);
      }
      await db.disqualification.create({
        data: {
          participantId: p.id,
          scope: 'STAGE',
          stageId: stages[0].id,
          status: 'REVOKED',
          reason: 'test',
          issuedByUserId: actorId,
        },
      });
      await db.participantLegacyEmail.create({
        data: { participantId: p.id, email: user.email },
      });
      await db.mediaUpload.create({
        data: {
          userId: actorId,
          targetType: 'PARTICIPANT_PHOTO',
          targetId: p.id,
          objectKey: 'test/' + tag + '/' + i,
          contentType: 'image/png',
          tokenHash: randomUUID(),
          expiresAt: new Date(),
          completedAt: new Date(),
        },
      });
      people.push({ p, user, car, config, version, regs, results });
    }
    return { stages, people, cls, season };
  };
  const remove = async (kind: string, id: string) => {
    const preview = await service.preview(kind, id, request);
    return service.remove(
      kind,
      id,
      { confirmation: preview.label, fingerprint: preview.fingerprint },
      request,
    );
  };
  it('removes all participant history and configurations, detaches login and recalculates other results', async () => {
    const f = await fixture(),
      a = f.people[0],
      b = f.people[1];
    const preview = await service.preview('participant', a.p.id, request);
    expect(preview.counts).toMatchObject({
      cars: 1,
      registrations: 2,
      results: 2,
      records: 2,
      inspections: 6,
      configurationVersions: 1,
      media: 1,
    });
    const deleted = await remove('participant', a.p.id);
    expect(deleted.success).toBe(true);
    expect(deleted.storageCleanupPending).toBe(true);
    expect(
      await db.participant.findUnique({ where: { id: a.p.id } }),
    ).toBeNull();
    expect(
      await db.carConfigurationVersion.findUnique({
        where: { id: a.version.id },
      }),
    ).toBeNull();
    expect(
      await db.carBattery.count({ where: { versionId: a.version.id } }),
    ).toBe(0);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: a.user.id } }))
        .participantId,
    ).toBeNull();
    expect(await db.importRow.count({ where: { participantId: a.p.id } })).toBe(
      0,
    );
    expect(
      await db.participantLegacyEmail.count({
        where: { participantId: a.p.id },
      }),
    ).toBe(0);
    expect(await db.record.count({ where: { participantId: a.p.id } })).toBe(0);
    expect(
      (
        await db.record.findFirstOrThrow({
          where: { classId: f.cls.id, isCurrent: true },
        })
      ).participantId,
    ).toBe(b.p.id);
    for (const result of b.results)
      expect(
        (await db.result.findUniqueOrThrow({ where: { id: result.id } })).place,
      ).toBe(1);
    expect(
      await db.stage.count({
        where: { id: { in: f.stages.map((s) => s.id) } },
      }),
    ).toBe(2);
    const receipt = await db.auditLog.findFirstOrThrow({
      where: { entityId: a.p.id, action: 'PERMANENT_DELETE' },
    });
    expect((receipt.metadata as any).objectKeys).toHaveLength(1);
  }, 30000);
  it('deletes a stage including imported results, registrations, inspections and jobs while preserving people and another stage', async () => {
    const f = await fixture(),
      stage = f.stages[0];
    await db.mediaUpload.create({
      data: {
        userId: actorId,
        targetType: 'SITE_ASSET',
        targetId: 'stage-poster-' + stage.id,
        objectKey: 'test/poster/' + stage.id,
        contentType: 'image/png',
        tokenHash: randomUUID(),
        expiresAt: new Date(),
      },
    });
    await remove('stage', stage.id);
    expect(await db.stage.findUnique({ where: { id: stage.id } })).toBeNull();
    for (const model of [
      db.registration,
      db.participantStageInspection,
      db.importJob,
      db.record,
      db.disqualification,
      db.emailNotificationLog,
    ] as const)
      expect(await (model.count as any)({ where: { stageId: stage.id } })).toBe(
        0,
      );
    for (const a of f.people) {
      expect(
        await db.participant.findUnique({ where: { id: a.p.id } }),
      ).not.toBeNull();
      expect(
        await db.car.findUnique({ where: { id: a.car.id } }),
      ).not.toBeNull();
      expect(
        await db.result.findUnique({ where: { id: a.results[1].id } }),
      ).not.toBeNull();
    }
  }, 30000);
  it('deletes an account and its participant, tokens and sessions; preserves its work on other participants', async () => {
    const f = await fixture(),
      a = f.people[0],
      b = f.people[1];
    await db.refreshSession.create({
      data: {
        userId: a.user.id,
        familyId: randomUUID(),
        tokenHash: randomUUID(),
        expiresAt: new Date(),
      },
    });
    await db.passwordResetToken.create({
      data: {
        userId: a.user.id,
        tokenHash: randomUUID(),
        expiresAt: new Date(),
      },
    });
    await db.result.update({
      where: { id: b.results[0].id },
      data: { createdByUserId: a.user.id, verifiedByUserId: a.user.id },
    });
    const ban = await db.disqualification.create({
      data: {
        participantId: b.p.id,
        scope: 'FORMAT',
        reason: 'valid other person',
        issuedByUserId: a.user.id,
      },
    });
    await db.registrationClassInspection.update({
      where: { registrationClassId: b.results[0].registrationClassId },
      data: { checkedByUserId: a.user.id, createdByUserId: a.user.id },
    });
    await remove('user', a.user.id);
    expect(await db.user.findUnique({ where: { id: a.user.id } })).toBeNull();
    expect(
      await db.participant.findUnique({ where: { id: a.p.id } }),
    ).toBeNull();
    expect(
      await db.refreshSession.count({ where: { userId: a.user.id } }),
    ).toBe(0);
    expect(
      await db.passwordResetToken.count({ where: { userId: a.user.id } }),
    ).toBe(0);
    expect(
      (await db.result.findUniqueOrThrow({ where: { id: b.results[0].id } }))
        .createdByUserId,
    ).toBeNull();
    expect(
      (await db.disqualification.findUniqueOrThrow({ where: { id: ban.id } }))
        .issuedByUserId,
    ).toBe(actorId);
    expect(
      await db.participant.findUnique({ where: { id: b.p.id } }),
    ).not.toBeNull();
  }, 30000);
  it('requires real ADMIN, exact confirmation and fresh preview; protects self and blocks active archive import', async () => {
    const f = await fixture(),
      a = f.people[0];
    const p = await service.preview('participant', a.p.id, request);
    const delegated = {
      user: {
        sub: a.user.id,
        role: 'PARTICIPANT',
        customRoleId: 'all-permissions',
      },
    } as AuthenticatedRequest;
    await expect(
      service.preview('participant', a.p.id, delegated),
    ).rejects.toThrow('только ADMIN');
    await expect(
      service.remove(
        'participant',
        a.p.id,
        { confirmation: 'wrong', fingerprint: p.fingerprint },
        request,
      ),
    ).rejects.toThrow('точное');
    await db.result.update({
      where: { id: a.results[0].id },
      data: { value: 170 },
    });
    await expect(
      service.remove(
        'participant',
        a.p.id,
        { confirmation: p.label, fingerprint: p.fingerprint },
        request,
      ),
    ).rejects.toThrow('изменились');
    await expect(service.preview('user', actorId, request)).rejects.toThrow(
      'собственную',
    );
    const batch = await db.historicalImportBatch.create({
      data: {
        sourceHash: randomUUID(),
        status: 'RUNNING',
        plan: {},
        progress: {},
      },
    });
    try {
      await expect(
        service.preview('stage', f.stages[0].id, request),
      ).rejects.toThrow('импорта');
    } finally {
      await db.historicalImportBatch.delete({ where: { id: batch.id } });
    }
    expect(
      await db.participant.findUnique({ where: { id: a.p.id } }),
    ).not.toBeNull();
  }, 30000);
  it('deletes an unlinked staff account while retaining other profiles and pending file cleanup', async () => {
    const staff = await db.user.create({
      data: {
        email: randomUUID() + '@delete-test.invalid',
        passwordHash: 'unused',
        role: 'ADMIN',
      },
    });
    const receipt = await db.auditLog.create({
      data: {
        userId: staff.id,
        action: 'PERMANENT_DELETE',
        entity: 'participant',
        entityId: randomUUID(),
        metadata: {
          storageCleanupPending: true,
          objectKeys: ['pending-other-file'],
        },
      },
    });
    const survivor = await db.participant.create({
      data: { firstName: 'Другой', lastName: 'Участник' },
    });
    const asset = await db.mediaUpload.create({
      data: {
        userId: staff.id,
        targetType: 'PARTICIPANT_PHOTO',
        targetId: survivor.id,
        objectKey: 'test/other/' + randomUUID(),
        contentType: 'image/png',
        tokenHash: randomUUID(),
        expiresAt: new Date(),
        completedAt: new Date(),
      },
    });
    const preview = await service.preview('user', staff.id, request);
    expect(preview.counts.participants).toBe(0);
    await remove('user', staff.id);
    expect(await db.user.findUnique({ where: { id: staff.id } })).toBeNull();
    expect(
      (await db.auditLog.findUniqueOrThrow({ where: { id: receipt.id } }))
        .userId,
    ).toBe(actorId);
    expect(
      (await db.mediaUpload.findUniqueOrThrow({ where: { id: asset.id } }))
        .userId,
    ).toBe(actorId);
    expect(
      await db.participant.findUnique({ where: { id: survivor.id } }),
    ).not.toBeNull();
  }, 30000);
  it('rolls the entire deletion back if record recalculation fails', async () => {
    const f = await fixture(),
      a = f.people[0];
    const broken = new AdminDeletionService(
      db,
      {
        recalculateCurrentRecordForClass: async () => {
          throw Error('recalc failed');
        },
      } as any,
      new ResultsRankingService(db),
      new MediaService(db),
    );
    const p = await broken.preview('participant', a.p.id, request);
    await expect(
      broken.remove(
        'participant',
        a.p.id,
        { confirmation: p.label, fingerprint: p.fingerprint },
        request,
      ),
    ).rejects.toThrow('recalc failed');
    expect(
      await db.participant.findUnique({ where: { id: a.p.id } }),
    ).not.toBeNull();
    expect(
      await db.result.count({
        where: { id: { in: a.results.map((r) => r.id) } },
      }),
    ).toBe(2);
    expect(
      await db.carConfigurationVersion.findUnique({
        where: { id: a.version.id },
      }),
    ).not.toBeNull();
  }, 30000);
});
