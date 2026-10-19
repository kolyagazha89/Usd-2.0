import { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { ArchiveStage } from './global-historical-plan';

type Candidate = {
  id: string;
  stageNumber: number;
  name: string;
  city: string | null;
  date: Date;
  legacyId: string | null;
};
const key = (s: string) =>
  s
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[^а-яa-z0-9]/g, '');
const nameKey = (s: string) => key(s.replace(/20\d{2}/g, ''));
const eventKind = (s: string) =>
  /финал/i.test(s) ? 'final' : /открыти/i.test(s) ? 'opening' : '';
export const archiveStageKey = (s: ArchiveStage) =>
  'USD_ARCHIVE_STAGE:' +
  s.year +
  ':' +
  s.date +
  ':' +
  key(s.city) +
  ':' +
  eventKind(s.name);

/** Event dates and locations identify an event; editable calendar numbers never do. */
export function matchingArchiveStages<T extends Candidate>(
  source: ArchiveStage,
  candidates: T[],
): T[] {
  const exact = candidates.filter(
    (s) =>
      s.date.toISOString().slice(0, 10) === source.date &&
      (s.city
        ? key(s.city) === key(source.city)
        : nameKey(s.name).includes(key(source.city))) &&
      (!eventKind(s.name) ||
        !eventKind(source.name) ||
        eventKind(s.name) === eventKind(source.name)),
  );
  if (exact.length) return exact;
  const labelled = candidates.filter(
    (s) =>
      s.legacyId === archiveStageKey(source) ||
      nameKey(s.name) === nameKey(source.name),
  );
  if (labelled.length) return labelled; // Existing safety checks will reject a changed date.
  // Old empty test slots were explicitly adoptable, but only in their own city.
  return candidates.filter(
    (s) =>
      s.stageNumber === source.number &&
      s.legacyId?.startsWith('USD_TEST_') &&
      key(s.city ?? '') === key(source.city),
  );
}

async function reconcileDuplicate(
  tx: Prisma.TransactionClient,
  source: ArchiveStage,
  matches: Candidate[],
) {
  const fail = () => {
    throw new Error(
      'Найдено несколько этапов на ' +
        source.date +
        ' в городе ' +
        source.city +
        '. Автоматическое объединение небезопасно: проверьте дубли этапа.',
    );
  };
  if (
    matches.length !== 2 ||
    matches.some(
      (s) =>
        s.date.toISOString().slice(0, 10) !== source.date ||
        (s.city && key(s.city) !== key(source.city)),
    )
  )
    return fail();
  const ownership = [];
  for (const candidate of matches) {
    const jobs = await tx.importJob.findMany({
      where: { stageId: candidate.id },
      select: { id: true, metadata: true },
    });
    const owned =
      jobs.length > 0 &&
      jobs.every((job) => {
        const meta = job.metadata as Record<string, unknown> | null;
        return (
          meta?.source === 'GLOBAL_HISTORICAL_XLSX' &&
          meta.workbookResultSheet === source.resultsSheet
        );
      });
    ownership.push({ candidate, jobs, owned });
  }
  const imported = ownership.filter((x) => x.owned),
    originals = ownership.filter((x) => !x.owned);
  if (imported.length !== 1 || originals.length !== 1) return fail();
  const duplicate = imported[0].candidate,
    original = originals[0].candidate;
  const from = await tx.stage.findUniqueOrThrow({
    where: { id: duplicate.id },
  });
  const to = await tx.stage.findUniqueOrThrow({ where: { id: original.id } });
  if (
    from.registrationOpen ||
    to.registrationOpen ||
    from.isDeleted ||
    to.isDeleted ||
    originals[0].jobs.length ||
    from.description ||
    from.venue ||
    from.address
  )
    return fail();
  for (const model of [
    tx.registration,
    tx.record,
    tx.disqualification,
    tx.participantStageInspection,
    tx.registrationNumber,
  ] as const) {
    if (await (model.count as any)({ where: { stageId: to.id } }))
      return fail();
  }
  if (
    (await tx.registration.count({
      where: { stageId: from.id, source: { not: 'IMPORT' } },
    })) ||
    (await tx.result.count({
      where: { registration: { stageId: from.id }, isHistorical: false },
    })) ||
    (await tx.record.count({
      where: { stageId: from.id, isManualOverride: true },
    })) ||
    (await tx.disqualification.count({ where: { stageId: from.id } })) ||
    (await tx.participantStageInspection.count({
      where: { stageId: from.id },
    })) ||
    (await tx.inspection.count({
      where: {
        registration: { stageId: from.id },
        OR: [
          { status: { not: 'PASSED' } },
          { checkedByName: null },
          { checkedByName: { not: 'Исторический импорт' } },
          { notes: null },
          { notes: { not: 'Автоматически пройдено при историческом импорте' } },
        ],
      },
    })) ||
    (await tx.registrationClassInspection.count({
      where: { registrationClass: { registration: { stageId: from.id } } },
    })) ||
    (await tx.mediaUpload.count({
      where: { targetType: 'SITE_ASSET', targetId: 'stage-poster-' + from.id },
    }))
  )
    return fail();
  // Prove that every moved result was committed by these exact archive jobs.
  const rows = await tx.importRow.findMany({
    where: {
      importJobId: { in: imported[0].jobs.map((j) => j.id) },
      type: 'RESULT',
      status: 'COMMITTED',
    },
    select: { registrationId: true, classId: true },
  });
  const results = await tx.result.findMany({
    where: { registration: { stageId: from.id } },
    include: { registrationClass: { select: { classId: true } } },
  });
  const proven = new Set(rows.map((r) => r.registrationId + ':' + r.classId));
  if (
    !results.length ||
    results.some(
      (r) => !proven.has(r.registrationId + ':' + r.registrationClass.classId),
    )
  )
    return fail();
  const registrationIds = [
    ...new Set(
      rows.map((r) => r.registrationId).filter((id): id is string => !!id),
    ),
  ];
  if (
    await tx.registration.count({
      where: { stageId: from.id, id: { notIn: registrationIds } },
    })
  )
    return fail();
  const classes = await tx.stageClass.findMany({ where: { stageId: from.id } });
  if (
    classes.some(
      (cls) =>
        cls.customName ||
        cls.description ||
        cls.settings ||
        cls.participantLimit !== null ||
        cls.sortOrder !== 0,
    )
  )
    return fail();
  for (const cls of classes)
    await tx.stageClass.upsert({
      where: { stageId_classId: { stageId: to.id, classId: cls.classId } },
      update: {},
      create: { stageId: to.id, classId: cls.classId, isActive: cls.isActive },
    });
  // A single transaction preserves result/registration/configuration IDs and
  // the operator's original calendar number, name, date and publication settings.
  if (to.legacyId?.startsWith('USD_TEST_'))
    await tx.stage.update({ where: { id: to.id }, data: { legacyId: null } });
  await tx.registration.updateMany({
    where: { stageId: from.id },
    data: { stageId: to.id },
  });
  await tx.registrationNumber.updateMany({
    where: { stageId: from.id },
    data: { stageId: to.id },
  });
  await tx.record.updateMany({
    where: { stageId: from.id },
    data: { stageId: to.id },
  });
  await tx.importJob.updateMany({
    where: { stageId: from.id },
    data: { stageId: to.id },
  });
  await tx.emailNotificationLog.updateMany({
    where: { stageId: from.id },
    data: { stageId: to.id },
  });
  await tx.stage.delete({ where: { id: from.id } });
  await tx.auditLog.create({
    data: {
      action: 'HISTORICAL_STAGE_DUPLICATE_RECONCILED',
      entity: 'Stage',
      entityId: to.id,
      metadata: {
        removedDuplicateId: from.id,
        archiveStageKey: archiveStageKey(source),
        resultsPreserved: results.length,
        registrationsPreserved: registrationIds.length,
      },
    },
  });
  return tx.stage.findUniqueOrThrow({ where: { id: to.id } });
}

export async function resolveHistoricalStage(
  prisma: PrismaService,
  source: ArchiveStage,
  seasonId: string,
) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('USD_IMPORT_IDENTITIES'))`;
      const candidates = await tx.stage.findMany({
        where: { seasonId },
        orderBy: { stageNumber: 'asc' },
      });
      const matches = matchingArchiveStages(source, candidates);
      if (matches.length > 1) return reconcileDuplicate(tx, source, matches);
      if (matches.length === 1) return matches[0];
      const number = candidates.some((s) => s.stageNumber === source.number)
        ? Math.max(source.number, ...candidates.map((s) => s.stageNumber)) + 1
        : source.number;
      return tx.stage.create({
        data: {
          seasonId,
          stageNumber: number,
          legacyId: archiveStageKey(source),
          name: source.name,
          city: source.city,
          date: new Date(source.date + 'T12:00:00.000Z'),
          status: source.year < 2026 ? 'COMPLETED' : 'PUBLISHED',
          registrationOpen: false,
        },
      });
    },
    { isolationLevel: 'Serializable', timeout: 30000 },
  );
}
