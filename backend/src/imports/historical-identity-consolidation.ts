import { createHash } from 'crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NameNormalizerService } from '../common/names/name-normalizer.service';
import { archivePersonName, approvedHistoricalNamePairs } from './global-historical-plan';
import { globalHistoricalAliasKey, globalHistoricalAliasLabels } from './historical-alias-identity';

type MinimalParticipant = {
  id: string; lastName: string; firstName: string; middleName: string | null;
  legacyId: string | null; historicalAlias: string | null;
  phone: string | null; photoUrl: string | null; birthDate: Date | null;
  user: { id: string } | null; createdAt: Date;
};

export type HistoricalIdentityMergeSummary = {
  groupsMerged: number;
  profilesMerged: number;
  skipped: Array<{ label: string; reason: string }>;
};

const globalLegacyId = (aliasKey: string) =>
  'HISTORICAL_ALIAS:' + createHash('sha256').update('GLOBAL:' + aliasKey).digest('hex');

/**
 * Consolidate ONLY operator-approved repeat labels / exact full-name pairs.
 * All dependent rows are transferred in one SERIALIZABLE transaction per
 * group. Stage-level results, cars and immutable configuration snapshots
 * are preserved; no result, car or registration is deleted.
 */
export async function consolidateApprovedHistoricalIdentities(
  prisma: PrismaService,
  names: NameNormalizerService,
): Promise<HistoricalIdentityMergeSummary> {
  const people = await prisma.participant.findMany({
    where: {
      OR: [
        { legacyId: { startsWith: 'HISTORICAL_ALIAS:' } },
        { historicalAlias: { not: null } },
        ...approvedHistoricalNamePairs.flatMap(pair => [
          { lastName: pair.source.split(' ')[0] },
          { lastName: pair.canonical.split(' ')[0] },
        ]),
      ],
    },
    select: {
      id: true, lastName: true, firstName: true, middleName: true,
      legacyId: true, historicalAlias: true, phone: true, photoUrl: true,
      birthDate: true, user: { select: { id: true } }, createdAt: true,
    },
  });
  type Candidate = MinimalParticipant;
  const groups = new Map<string, { label: string; aliasKey: string | null; people: Candidate[] }>();
  for (const person of people) {
    let aliasKey: string | null = null;
    let key: string | null = null;
    let label = '';
    if (person.historicalAlias && person.legacyId?.startsWith('HISTORICAL_ALIAS:')) {
      aliasKey = globalHistoricalAliasKey(person.historicalAlias);
      if (aliasKey) {
        key = 'alias:' + aliasKey;
        label = globalHistoricalAliasLabels[aliasKey];
      }
    } else if (!person.historicalAlias) {
      const original = [person.lastName, person.firstName, person.middleName].filter(Boolean).join(' ');
      const normalized = archivePersonName(original, names);
      const approved = approvedHistoricalNamePairs.find(pair =>
        normalized === pair.canonical &&
        [pair.source, pair.canonical].some(value =>
          archivePersonName(value, names) === normalized));
      if (approved) {
        key = 'name:' + approved.canonical;
        label = approved.canonical;
      }
    }
    if (!key) continue;
    const group = groups.get(key) ?? { label, aliasKey, people: [] };
    group.people.push(person);
    groups.set(key, group);
  }

  const summary: HistoricalIdentityMergeSummary = {
    groupsMerged: 0, profilesMerged: 0, skipped: [],
  };
  for (const group of groups.values()) {
    if (group.people.length < 2) continue;
    if (group.people.some(p =>
      p.user || p.phone || p.photoUrl || p.birthDate ||
      p.legacyId?.startsWith('USD_TEST_')
    )) {
      summary.skipped.push({ label: group.label, reason: 'Найдены защищённые или дополненные профили' });
      continue;
    }
    const allIds = group.people.map(p => p.id);
    try {
      const merged = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('USD_HISTORICAL_IDENTITY_DEDUP'))::text`;
        const current = await tx.participant.findMany({
          where: { id: { in: allIds } },
          include: { user: { select: { id: true } } },
        });
        if (current.length !== allIds.length ||
          current.some(p => p.user || p.phone || p.photoUrl || p.birthDate ||
            (group.aliasKey
              ? !p.legacyId?.startsWith('HISTORICAL_ALIAS:') ||
                globalHistoricalAliasKey(p.historicalAlias ?? '') !== group.aliasKey
              : p.historicalAlias ||
                archivePersonName([p.lastName, p.firstName, p.middleName].filter(Boolean).join(' '), names) !== group.label))) {
          throw new Error('Профили изменились или больше не соответствуют подтверждённому совпадению');
        }
        const ids = current.map(p => p.id);
        const [inspections, emails] = await Promise.all([
          tx.participantStageInspection.findMany({
            where: { participantId: { in: ids } },
            select: { participantId: true, stageId: true },
          }),
          tx.participantLegacyEmail.findMany({ where: { participantId: { in: ids } } }),
        ]);
        if (new Set(inspections.map(x => x.stageId)).size !== inspections.length) {
          throw new Error('Участники имеют разные техосмотры одного этапа');
        }
        const nonEmptyEmails = [...new Set(emails.map(e => (e.email ?? '').toLowerCase()).filter(Boolean))];
        if (nonEmptyEmails.length > 1) throw new Error('Разные архивные email требуют отдельной проверки');
        const expectedId = group.aliasKey ? globalLegacyId(group.aliasKey) : null;
        const sorted = [...current].sort((a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
        const target = (expectedId ? sorted.find(p => p.legacyId === expectedId) : null) ?? sorted[0];
        const otherIds = ids.filter(id => id !== target.id);
        if (!otherIds.length) return 0;
        // Move the direct participant references; all registration/result
        // IDs remain identical, so their historical snapshot does not change.
        await tx.car.updateMany({ where: { participantId: { in: otherIds } }, data: { participantId: target.id } });
        await tx.registration.updateMany({ where: { participantId: { in: otherIds } }, data: { participantId: target.id } });
        await tx.record.updateMany({ where: { participantId: { in: otherIds } }, data: { participantId: target.id } });
        await tx.disqualification.updateMany({ where: { participantId: { in: otherIds } }, data: { participantId: target.id } });
        await tx.participantStageInspection.updateMany({ where: { participantId: { in: otherIds } }, data: { participantId: target.id } });
        await tx.importRow.updateMany({ where: { participantId: { in: otherIds } }, data: { participantId: target.id } });
        if (emails.length) {
          const email = nonEmptyEmails[0] ?? null;
          await tx.participantLegacyEmail.upsert({
            where: { participantId: target.id },
            create: { participantId: target.id, email },
            update: email ? { email } : {},
          });
          await tx.participantLegacyEmail.deleteMany({ where: { participantId: { in: otherIds } } });
        }
        await tx.participant.deleteMany({ where: { id: { in: otherIds } } });
        await tx.participant.update({
          where: { id: target.id },
          data: group.aliasKey
            ? { legacyId: expectedId, lastName: group.label, firstName: '', middleName: null, historicalAlias: group.label }
            : { lastName: group.label.split(' ')[0], firstName: group.label.split(' ')[1], middleName: null },
        });
        return otherIds.length;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000, maxWait: 15000 });
      if (merged) { summary.groupsMerged++; summary.profilesMerged += merged; }
    } catch (error) {
      summary.skipped.push({
        label: group.label,
        reason: error instanceof Error ? error.message : 'Неизвестная ошибка',
      });
    }
  }
  return summary;
}
