import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecordsService } from '../records/records.service';
import { ResultsRankingService } from '../results/results-ranking.service';
import { MediaService } from '../media/media.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import type { PermanentDeleteDto } from './admin-deletion.controller';

type Kind = 'participant' | 'stage' | 'user';
type Tx = Prisma.TransactionClient;
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

@Injectable()
export class AdminDeletionService implements OnModuleInit, OnModuleDestroy {
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private cleaning = false;
  onModuleInit() {
    this.cleanupTimer = setInterval(() => {
      void this.retryPendingStorage().catch(() => undefined);
    }, 60000);
    this.cleanupTimer.unref();
  }
  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }
  async retryPendingStorage() {
    if (this.cleaning) return;
    this.cleaning = true;
    try {
      const receipts = await this.prisma.auditLog.findMany({
        where: {
          action: 'PERMANENT_DELETE',
          metadata: { path: ['storageCleanupPending'], equals: true },
        },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });
      for (const receipt of receipts) {
        const metadata = receipt.metadata as Record<string, any>;
        const keys = Array.isArray(metadata.objectKeys)
          ? metadata.objectKeys.filter(
              (key: unknown): key is string => typeof key === 'string',
            )
          : [];
        const pending = await this.media.deleteStoredObjects(keys);
        await this.prisma.auditLog.update({
          where: { id: receipt.id },
          data: {
            metadata: {
              ...metadata,
              storageCleanupPending: pending.length > 0,
              objectKeys: pending,
            },
          },
        });
      }
    } finally {
      this.cleaning = false;
    }
  }
  constructor(
    private readonly prisma: PrismaService,
    private readonly records: RecordsService,
    private readonly ranking: ResultsRankingService,
    private readonly media: MediaService,
  ) {}

  private kind(value: string): Kind {
    if (value !== 'participant' && value !== 'stage' && value !== 'user')
      throw new BadRequestException('Неизвестный тип удаления');
    return value;
  }
  private async authorize(tx: Tx, request: AuthenticatedRequest) {
    if (request.user?.role !== 'ADMIN')
      throw new ForbiddenException('Полное удаление доступно только ADMIN');
    const actor = await tx.user.findUnique({ where: { id: request.user.sub } });
    if (!actor || !actor.isActive || actor.role !== 'ADMIN')
      throw new ForbiddenException(
        'Полное удаление доступно только активному ADMIN',
      );
  }
  private async collect(
    tx: Tx,
    kind: Kind,
    id: string,
    request: AuthenticatedRequest,
  ) {
    await this.authorize(tx, request);
    if (
      await tx.historicalImportBatch.count({ where: { status: 'RUNNING' } })
    ) {
      throw new ConflictException(
        'Дождитесь завершения архивного импорта перед полным удалением',
      );
    }
    const user =
      kind === 'user'
        ? await tx.user.findUnique({
            where: { id },
            select: {
              id: true,
              email: true,
              role: true,
              isActive: true,
              participantId: true,
              updatedAt: true,
            },
          })
        : null;
    const stage =
      kind === 'stage' ? await tx.stage.findUnique({ where: { id } }) : null;
    const participantId = kind === 'participant' ? id : user?.participantId;
    const participant = participantId
      ? await tx.participant.findUnique({ where: { id: participantId } })
      : null;
    if (
      (kind === 'user' && !user) ||
      (kind === 'stage' && !stage) ||
      (kind === 'participant' && !participant)
    )
      throw new NotFoundException('Запись уже удалена или не найдена');
    if (user) {
      if (user.id === request.user.sub)
        throw new ConflictException(
          'Нельзя полностью удалить собственную учётную запись',
        );
      if (
        user.role === 'ADMIN' &&
        user.isActive &&
        (await tx.user.count({ where: { role: 'ADMIN', isActive: true } })) <= 1
      )
        throw new ConflictException(
          'Нельзя удалить последнего активного администратора',
        );
    }
    const cars = participant
      ? await tx.car.findMany({
          where: { participantId: participant.id },
          orderBy: { id: 'asc' },
        })
      : [];
    const carIds = ids(cars);
    const registrations = await tx.registration.findMany({
      where: stage
        ? { stageId: id }
        : participant
          ? {
              OR: [
                { participantId: participant.id },
                { carId: { in: carIds } },
              ],
            }
          : { id: { in: [] } },
      orderBy: { id: 'asc' },
    });
    const registrationIds = ids(registrations);
    const classes = await tx.registrationClass.findMany({
      where: { registrationId: { in: registrationIds } },
      orderBy: { id: 'asc' },
    });
    const classIds = ids(classes);
    const results = await tx.result.findMany({
      where: { registrationId: { in: registrationIds } },
      orderBy: { id: 'asc' },
    });
    const resultIds = ids(results);
    const records = await tx.record.findMany({
      where: {
        OR: [
          { resultId: { in: resultIds } },
          ...(stage ? [{ stageId: id }] : []),
          ...(participant
            ? [{ participantId: participant.id }, { carId: { in: carIds } }]
            : []),
        ],
      },
      orderBy: { id: 'asc' },
    });
    const inspections = await tx.inspection.findMany({
      where: { registrationId: { in: registrationIds } },
      orderBy: { id: 'asc' },
    });
    const classInspections = await tx.registrationClassInspection.findMany({
      where: { registrationClassId: { in: classIds } },
      orderBy: { id: 'asc' },
    });
    const stageInspections = await tx.participantStageInspection.findMany({
      where: stage
        ? { stageId: id }
        : participant
          ? { participantId: participant.id }
          : { id: { in: [] } },
      orderBy: { id: 'asc' },
    });
    const disqualifications = await tx.disqualification.findMany({
      where: stage
        ? { stageId: id }
        : participant
          ? { participantId: participant.id }
          : { id: { in: [] } },
      orderBy: { id: 'asc' },
    });
    const versions = carIds.length
      ? await tx.carConfigurationVersion.findMany({
          where: { configuration: { carId: { in: carIds } } },
          select: { id: true, createdAt: true },
          orderBy: { id: 'asc' },
        })
      : [];
    const jobs = stage
      ? await tx.importJob.findMany({
          where: { stageId: id },
          select: { id: true, updatedAt: true },
          orderBy: { id: 'asc' },
        })
      : [];
    const importRows = await tx.importRow.findMany({
      where: {
        OR: [
          { registrationId: { in: registrationIds } },
          ...(participant ? [{ participantId: participant.id }] : []),
          { importJobId: { in: ids(jobs) } },
        ],
      },
      select: { id: true, updatedAt: true },
      orderBy: { id: 'asc' },
    });
    const media = await tx.mediaUpload.findMany({
      where: {
        OR: [
          ...(participant
            ? [
                {
                  targetType: 'PARTICIPANT_PHOTO' as const,
                  targetId: participant.id,
                },
                { targetType: 'CAR_PHOTO' as const, targetId: { in: carIds } },
              ]
            : []),
          ...(stage
            ? [
                {
                  targetType: 'SITE_ASSET' as const,
                  targetId: 'stage-poster-' + id,
                },
              ]
            : []),
        ],
      },
      orderBy: { id: 'asc' },
    });
    const linkedUser =
      kind === 'participant'
        ? await tx.user.findUnique({
            where: { participantId: id },
            select: { email: true },
          })
        : null;
    const label =
      user?.email ??
      stage?.name ??
      [participant?.lastName, participant?.firstName, participant?.middleName]
        .filter(Boolean)
        .join(' ');
    const sessions = user
      ? await tx.refreshSession.count({ where: { userId: id } })
      : 0;
    const tokens = user
      ? (await tx.emailVerificationToken.count({ where: { userId: id } })) +
        (await tx.emailChangeToken.count({ where: { userId: id } })) +
        (await tx.passwordResetToken.count({ where: { userId: id } })) +
        (await tx.googleOAuthState.count({ where: { userId: id } }))
      : 0;
    const counts = {
      sessions,
      tokens,
      participants: participant ? 1 : 0,
      accounts: user ? 1 : 0,
      cars: cars.length,
      configurationVersions: versions.length,
      registrations: registrations.length,
      results: results.length,
      records: records.length,
      inspections:
        inspections.length + classInspections.length + stageInspections.length,
      disqualifications: disqualifications.length,
      importJobs: jobs.length,
      importRows: importRows.length,
      media: media.length,
    };
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          kind,
          id,
          counts,
          user,
          linkedUser,
          stage,
          participant,
          cars,
          registrations,
          classes,
          results,
          records,
          inspections,
          classInspections,
          stageInspections,
          disqualifications,
          versions,
          jobs,
          importRows,
          media,
        }),
      )
      .digest('hex');
    return {
      kind,
      id,
      label,
      counts,
      fingerprint,
      linkedAccount: linkedUser?.email ?? null,
      user,
      stage,
      participant,
      cars,
      versions,
      registrations,
      classes,
      results,
      records,
      inspections,
      classInspections,
      stageInspections,
      disqualifications,
      jobs,
      importRows,
      media,
    };
  }
  private publicPlan(
    plan: Awaited<ReturnType<AdminDeletionService['collect']>>,
  ) {
    return {
      kind: plan.kind,
      id: plan.id,
      label: plan.label,
      counts: plan.counts,
      fingerprint: plan.fingerprint,
      linkedAccount: plan.linkedAccount,
    };
  }
  async preview(value: string, id: string, request: AuthenticatedRequest) {
    const kind = this.kind(value);
    return this.prisma.$transaction(
      async (tx) => this.publicPlan(await this.collect(tx, kind, id, request)),
      { isolationLevel: 'RepeatableRead', timeout: 30000 },
    );
  }
  async remove(
    value: string,
    id: string,
    body: PermanentDeleteDto,
    request: AuthenticatedRequest,
  ) {
    const kind = this.kind(value);
    let deleted: {
      auditId: string;
      counts: Record<string, number>;
      keys: string[];
    };
    try {
      deleted = await this.prisma.$transaction(
        async (tx) => {
          // Serialize deletes and historical identity writes. Serializable isolation also
          // rolls back if a concurrent registration/result changes the confirmed scope.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('USD_IMPORT_IDENTITIES'))`;
          const plan = await this.collect(tx, kind, id, request);
          if (
            typeof body?.confirmation !== 'string' ||
            body.confirmation.trim() !== plan.label
          )
            throw new BadRequestException(
              'Для подтверждения введите точное название или email',
            );
          if (!body.fingerprint || body.fingerprint !== plan.fingerprint)
            throw new ConflictException(
              'Связанные данные изменились. Заново откройте подтверждение удаления',
            );
          const registrationIds = ids(plan.registrations),
            carIds = ids(plan.cars),
            resultIds = ids(plan.results);
          const affectedClasses = new Set([
            ...plan.classes.map((c) => c.classId),
            ...plan.records.map((r) => r.classId),
          ]);
          const affectedPairs = new Map(
            plan.results.map((r) => {
              const reg = plan.registrations.find(
                (x) => x.id === r.registrationId,
              )!;
              const cls = plan.classes.find(
                (x) => x.id === r.registrationClassId,
              )!;
              return [
                reg.stageId + ':' + cls.classId,
                { stageId: reg.stageId, classId: cls.classId },
              ];
            }),
          );
          await tx.record.deleteMany({
            where: { id: { in: ids(plan.records) } },
          });
          await tx.importRow.deleteMany({
            where: { id: { in: ids(plan.importRows) } },
          });
          await tx.emailNotificationLog.deleteMany({
            where: {
              OR: [
                { registrationId: { in: registrationIds } },
                ...(plan.stage ? [{ stageId: id }] : []),
              ],
            },
          });
          await tx.registration.deleteMany({
            where: { id: { in: registrationIds } },
          });
          await tx.participantStageInspection.deleteMany({
            where: { id: { in: ids(plan.stageInspections) } },
          });
          await tx.disqualification.deleteMany({
            where: { id: { in: ids(plan.disqualifications) } },
          });
          await tx.mediaUpload.deleteMany({
            where: { id: { in: ids(plan.media) } },
          });
          if (plan.participant) {
            await tx.user.updateMany({
              where: { participantId: plan.participant.id },
              data: { participantId: null },
            });
            await tx.participantLegacyEmail.deleteMany({
              where: { participantId: plan.participant.id },
            });
            await tx.car.deleteMany({ where: { id: { in: carIds } } });
            await tx.participant.delete({ where: { id: plan.participant.id } });
          }
          if (plan.stage) {
            await tx.importJob.deleteMany({ where: { stageId: id } });
            await tx.stage.delete({ where: { id } });
            const settings = await tx.siteSettings.findUnique({
              where: { id: 'default' },
            });
            if (settings) {
              const homepage = settings.homepage as Record<string, any>;
              const posters = { ...homepage.stagePosters };
              delete posters[id];
              await tx.siteSettings.update({
                where: { id: 'default' },
                data: { homepage: { ...homepage, stagePosters: posters } },
              });
            }
          }
          if (plan.user) {
            // Judging/administration of other people remains valid after staff leave.
            // Required issuer/author links transfer to the deleting administrator.
            await tx.disqualification.updateMany({
              where: { issuedByUserId: id },
              data: { issuedByUserId: request.user.sub },
            });
            await tx.disqualification.updateMany({
              where: { revokedByUserId: id },
              data: { revokedByUserId: null },
            });
            await tx.assistantRequest.deleteMany({
              where: { requestedByUserId: id },
            });
            await tx.assistantRequest.updateMany({
              where: { approvedByUserId: id },
              data: { approvedByUserId: null },
            });
            await tx.googleConnection.deleteMany({
              where: { connectedByUserId: id },
            });
            await tx.mediaUpload.updateMany({
              where: { userId: id },
              data: { userId: request.user.sub },
            });
            await tx.importJob.updateMany({
              where: { createdByUserId: id },
              data: { createdByUserId: null },
            });
            await tx.historicalImportBatch.updateMany({
              where: { createdByUserId: id },
              data: { createdByUserId: null },
            });
            for (const table of [
              tx.inspection,
              tx.participantStageInspection,
              tx.registrationClassInspection,
            ] as const) {
              await (table.updateMany as any)({
                where: { checkedByUserId: id },
                data: { checkedByUserId: null },
              });
              await (table.updateMany as any)({
                where: { createdByUserId: id },
                data: { createdByUserId: null },
              });
            }
            await tx.result.updateMany({
              where: { createdByUserId: id },
              data: { createdByUserId: null },
            });
            await tx.result.updateMany({
              where: { verifiedByUserId: id },
              data: { verifiedByUserId: null },
            });
            await tx.componentCatalogRequest.updateMany({
              where: { resolvedByUserId: id },
              data: { resolvedByUserId: null },
            });
            await tx.registration.updateMany({
              where: { consentCapturedByUserId: id },
              data: { consentCapturedByUserId: null },
            });
            await tx.historicalConfigurationConfirmation.updateMany({
              where: { confirmedByUserId: id },
              data: { confirmedByUserId: request.user.sub },
            });
            await tx.emailNotificationLog.deleteMany({
              where: { recipient: plan.user.email },
            });
            await tx.auditLog.updateMany({
              where: { userId: id, action: 'PERMANENT_DELETE' },
              data: { userId: request.user.sub },
            });
            await tx.auditLog.deleteMany({ where: { userId: id } });
            await tx.user.delete({ where: { id } });
          }
          const entityIds = [
            id,
            ...carIds,
            ...registrationIds,
            ...resultIds,
            ...ids(plan.classes),
            ...ids(plan.records),
            ...ids(plan.inspections),
            ...ids(plan.stageInspections),
            ...ids(plan.classInspections),
            ...ids(plan.versions),
            ...ids(plan.disqualifications),
            ...ids(plan.jobs),
            ...ids(plan.importRows),
            ...ids(plan.media),
            ...(plan.participant ? [plan.participant.id] : []),
          ];
          await tx.auditLog.deleteMany({
            where: {
              OR: [
                { entityId: { in: entityIds } },
                ...(plan.participant
                  ? [
                      {
                        metadata: {
                          path: ['participantId'],
                          equals: plan.participant.id,
                        },
                      },
                    ]
                  : []),
                ...(plan.stage
                  ? [{ metadata: { path: ['stageId'], equals: id } }]
                  : []),
              ],
            },
          });
          // A subsequent archive run must inspect existing results again, rather than
          // reuse a completed batch containing deleted participant/stage IDs.
          await tx.historicalImportBatch.updateMany({
            where: { status: { in: ['COMPLETED', 'NEEDS_REVIEW'] } },
            data: {
              status: 'INVALIDATED',
              activeKey: null,
              leaseOwner: null,
              leaseUntil: null,
            },
          });
          for (const classId of affectedClasses)
            await this.records.recalculateCurrentRecordForClass(tx, classId);
          if (!plan.stage)
            for (const pair of affectedPairs.values()) {
              if (
                await tx.stageClass.findUnique({
                  where: { stageId_classId: pair },
                })
              )
                await this.ranking.recalculateInTransaction(
                  tx,
                  pair.stageId,
                  pair.classId,
                );
            }
          const keys = plan.media.map((m) => m.objectKey);
          const receipt = await tx.auditLog.create({
            data: {
              userId: request.user.sub,
              action: 'PERMANENT_DELETE',
              entity: kind,
              entityId: id,
              ipAddress: request.ip,
              metadata: {
                counts: plan.counts,
                storageCleanupPending: keys.length > 0,
                objectKeys: keys,
              },
            },
          });
          return { auditId: receipt.id, counts: plan.counts, keys };
        },
        { isolationLevel: 'Serializable', timeout: 60000, maxWait: 10000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2034', 'P2003'].includes(error.code)
      )
        throw new ConflictException(
          'Данные изменились во время удаления. Обновите подтверждение и повторите',
        );
      throw error;
    }
    const pending = await this.media.deleteStoredObjects(deleted.keys);
    // The receipt already contains the keys if storage or this update fails.
    await this.prisma.auditLog
      .update({
        where: { id: deleted.auditId },
        data: {
          metadata: {
            counts: deleted.counts,
            storageCleanupPending: pending.length > 0,
            objectKeys: pending,
          },
        },
      })
      .catch(() => undefined);
    return {
      success: true,
      kind,
      id,
      counts: deleted.counts,
      storageCleanupPending: pending.length > 0,
    };
  }
}
