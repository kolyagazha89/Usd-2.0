import { createHash } from 'crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NameNormalizerService } from '../common/names/name-normalizer.service';
import { historicalExistingFullNameRepairs } from '../common/names/historical-source-corrections';
import { archiveNameKey, archivePersonName, approvedHistoricalNamePairs, type ArchivePlan } from './global-historical-plan';
import { archivalAliasDisplayLabel, archivalAliasKey, globalHistoricalAliasKey, globalHistoricalAliasLabels } from './historical-alias-identity';

type MinimalParticipant = {
  id: string; lastName: string; firstName: string; middleName: string | null;
  legacyId: string | null; historicalAlias: string | null;
  phone: string | null; photoUrl: string | null; birthDate: Date | null;
  user: { id: string } | null; createdAt: Date;
  registrations: Array<{ source: string; stageId: string }>;
};

export type HistoricalIdentityMergeSummary = {
  groupsMerged: number;
  profilesMerged: number;
  namesCorrected: number;
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
  plan?: ArchivePlan,
): Promise<HistoricalIdentityMergeSummary> {
  const people = await prisma.participant.findMany({
    where: {
      OR: [
        ...(plan ? [{ registrations: { some: { source: 'IMPORT' as const } } }] : []),
        { legacyId: { startsWith: 'HISTORICAL_ALIAS:' } },
        { historicalAlias: { not: null } },
        ...approvedHistoricalNamePairs.flatMap(pair => [
          { lastName: pair.source.split(' ')[0] },
          { lastName: pair.canonical.split(' ')[0] },
        ]),
        { lastName: 'Ксы', firstName: 'Аперол' },
        ...Object.keys(historicalExistingFullNameRepairs).map(label => ({
          lastName: label.split(' ')[0].charAt(0).toLocaleUpperCase('ru') + label.split(' ')[0].slice(1),
        })),
      ],
    },
    select: {
      id: true, lastName: true, firstName: true, middleName: true,
      legacyId: true, historicalAlias: true, phone: true, photoUrl: true,
      birthDate: true, user: { select: { id: true } }, createdAt: true,
      registrations: { select: { source: true, stageId: true } }, 
    },
  });
  // A broken-name alias may be repaired only when the supplied Results
  // plan contains its exact canonical identity. No edit-distance guessing.
  const sourceNames=new Map<string,Set<string>>();
  for(const stage of plan?.stages??[])for(const row of stage.results){
    const label=archivePersonName(row['ФИО'],names);
    if(names.inspect(label).needsReview||label.split(' ').length!==2)continue;
    const key=archiveNameKey(label,names), group=sourceNames.get(key)??new Set<string>();
    group.add(label);sourceNames.set(key,group);
  }
  const canonicalPerson=(person:MinimalParticipant):string|null=>{
    if(person.middleName)return null;
    const label=archivePersonName(person.historicalAlias??[person.lastName,person.firstName].filter(Boolean).join(' '),names);
    if(names.inspect(label).needsReview||label.split(' ').length!==2)return null;
    const sources=sourceNames.get(archiveNameKey(label,names));
    return sources?.size===1?[...sources][0]:null;
  };
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
    if (!key) { const canonical=canonicalPerson(person);if(canonical){key='name:'+canonical;label=canonical;} }
    if (!key) continue;
    const group = groups.get(key) ?? { label, aliasKey, people: [] };
    group.people.push(person);
    groups.set(key, group);
  }

  const summary: HistoricalIdentityMergeSummary = {
    groupsMerged: 0, profilesMerged: 0, namesCorrected: 0, skipped: [],
  };
  const handledPersonalIds=new Set<string>();
  const safeHistorical = (p: MinimalParticipant) => !p.user && !p.phone && !p.photoUrl && !p.birthDate &&
    !p.legacyId?.startsWith('USD_TEST_') &&
    p.registrations.length > 0 && p.registrations.every(registration => registration.source === 'IMPORT');

  for (const group of groups.values()) {
    if (group.people.length === 1) {
      // An earlier merge may already have left a single `34sound` profile.
      // Normalize its display name even though there are no duplicates to delete.
      const only = group.people[0];
      const aliasKey = group.aliasKey;
      if (aliasKey && safeHistorical(only) &&
        (only.lastName !== group.label || only.historicalAlias !== group.label ||
          only.legacyId !== globalLegacyId(aliasKey))) {
        try {
          await prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('USD_IMPORT_IDENTITIES'))::text`;
            const current = await tx.participant.findMany({
              where: { id: { in: [only.id] } },
              include: { user: { select: { id: true } }, registrations: { select: { source: true, stageId: true } } },
            });
            if (current.length !== 1 || !safeHistorical(current[0]) ||
              globalHistoricalAliasKey(current[0].historicalAlias ?? '') !== group.aliasKey)
              throw new Error('Архивный профиль изменился до исправления написания');
            await tx.participant.update({
              where: { id: only.id },
              data: { lastName: group.label, historicalAlias: group.label, legacyId: globalLegacyId(aliasKey) },
            });
          }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000, maxWait: 15000 });
          summary.namesCorrected++;
        } catch (error) {
          summary.skipped.push({ label: group.label, reason: error instanceof Error ? error.message : 'Неизвестная ошибка' });
        }
      }
      if(!aliasKey && safeHistorical(only) && canonicalPerson(only)===group.label &&
        (only.historicalAlias || [only.lastName,only.firstName].join(' ')!==group.label)) {
        try {
          await prisma.$transaction(async tx=>{
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('USD_IMPORT_IDENTITIES'))::text`;
            const current=await tx.participant.findMany({where:{id:{in:[only.id]}},include:{user:{select:{id:true}},registrations:{select:{source:true,stageId:true}}}});
            if(current.length!==1||!safeHistorical(current[0])||canonicalPerson(current[0])!==group.label)throw new Error('Профиль изменился до исправления ФИО');
            await tx.participant.update({where:{id:only.id},data:{lastName:group.label.split(' ')[0],firstName:group.label.split(' ')[1],middleName:null,historicalAlias:null,...(current[0].legacyId?.startsWith('HISTORICAL_ALIAS:')?{legacyId:null}:{})}});
          },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:60000,maxWait:15000});
          summary.namesCorrected++;handledPersonalIds.add(only.id);
        }catch(error){summary.skipped.push({label:group.label,reason:error instanceof Error?error.message:'Не удалось исправить ФИО'})}
      }
      continue;
    }
    if (group.people.some(p =>
      p.user || p.phone || p.photoUrl || p.birthDate ||
      !p.registrations.length || p.registrations.some(r => r.source !== 'IMPORT') ||
      p.legacyId?.startsWith('USD_TEST_')
    )) {
      summary.skipped.push({ label: group.label, reason: 'Найдены защищённые или дополненные профили' });
      continue;
    }
    const allIds = group.people.map(p => p.id);
    try {
      const merged = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('USD_IMPORT_IDENTITIES'))::text`;
        const current = await tx.participant.findMany({
          where: { id: { in: allIds } },
          include: { user: { select: { id: true } }, registrations: { select: { source: true, stageId: true } } }, 
        });
        if (current.length !== allIds.length ||
          current.some(p => p.user || p.phone || p.photoUrl || p.birthDate ||
            !p.registrations.length || p.registrations.some(r => r.source !== 'IMPORT') ||
            (group.aliasKey
              ? !p.legacyId?.startsWith('HISTORICAL_ALIAS:') ||
                globalHistoricalAliasKey(p.historicalAlias ?? '') !== group.aliasKey
              : (canonicalPerson(p) ?? (!p.historicalAlias ? archivePersonName([p.lastName,p.firstName,p.middleName].filter(Boolean).join(' '),names) : null)) !== group.label))) {
          throw new Error('Профили изменились или больше не соответствуют подтверждённому совпадению');
        }
        const ids = current.map(p => p.id);
        const [inspections, emails, registrations] = await Promise.all([
          tx.participantStageInspection.findMany({
            where: { participantId: { in: ids } },
            select: { participantId: true, stageId: true },
          }),
          tx.participantLegacyEmail.findMany({ where: { participantId: { in: ids } } }),
          tx.registration.findMany({
            where: { participantId: { in: ids } },
            select: {
              participantId: true, stageId: true, participantNumber: true,
              classes: { select: { classId: true } },
            },
          }),
        ]);
        if (new Set(inspections.map(x => x.stageId)).size !== inspections.length) {
          throw new Error('Участники имеют разные техосмотры одного этапа');
        }
        const stageClasses = new Map<string, { participantId: string; number: number }>();
        for (const registration of registrations) {
          for (const entry of registration.classes) {
            const key = registration.stageId + ':' + entry.classId;
            const previous = stageClasses.get(key);
            if (previous && previous.participantId !== registration.participantId &&
              previous.number !== registration.participantNumber) {
              throw new Error('Один архивный псевдоним использован разными номерами одного класса на одном этапе');
            }
            stageClasses.set(key, { participantId: registration.participantId, number: registration.participantNumber });
          }
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
            : { lastName: group.label.split(' ')[0], firstName: group.label.split(' ')[1], middleName: null, historicalAlias: null, ...(target.legacyId?.startsWith('HISTORICAL_ALIAS:')?{legacyId:null}:{}) },
        });
        return otherIds.length;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000, maxWait: 15000 });
      if (merged) { summary.groupsMerged++; summary.profilesMerged += merged;if(!group.aliasKey)for(const id of allIds)handledPersonalIds.add(id); }
    } catch (error) {
      summary.skipped.push({
        label: group.label,
        reason: error instanceof Error ? error.message : 'Неизвестная ошибка',
      });
    }
  }
  // Repair *existing* corrupted Cyrillic FIO, not only future import previews.
  // Each correction is an exact verified full name, never an edit-distance
  // guess. Account-linked, manually created and on-site profiles are exempt.
  for (const person of people) {
    if (handledPersonalIds.has(person.id) || person.historicalAlias || person.middleName || !safeHistorical(person)) continue;
    const oldFullName = [person.lastName, person.firstName].join(' ');
    const canonical = historicalExistingFullNameRepairs[oldFullName.toLocaleLowerCase('ru')];
    if (!canonical || canonical === oldFullName) continue;
    const [lastName, firstName] = canonical.split(' ');
    try {
      await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('USD_IMPORT_IDENTITIES'))::text`;
        const current = await tx.participant.findMany({
          where: { id: { in: [person.id] } },
          include: { user: { select: { id: true } }, registrations: { select: { source: true, stageId: true } } },
        });
        if (current.length !== 1 || !safeHistorical(current[0]) || current[0].middleName ||
          current[0].lastName !== person.lastName || current[0].firstName !== person.firstName ||
          current[0].historicalAlias) {
          throw new Error('Данные участника изменились до проверки');
        }
        const duplicate = await tx.participant.findFirst({
          where: { id: { not: person.id }, lastName, firstName, middleName: null },
          select: { id: true },
        });
        if (duplicate) throw new Error('Правильное ФИО уже занято другой карточкой; сначала нужно безопасное объединение');
        await tx.participant.update({
          where: { id: person.id },
          data: { lastName, firstName },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000, maxWait: 15000 });
      summary.namesCorrected++;
    } catch (error) {
      summary.skipped.push({ label: oldFullName, reason: error instanceof Error ? error.message : 'Неизвестная ошибка' });
    }
  }
  // This exact label comes from the final 2026 Results row #44, sticker
  // 142. It is an unverified stage alias, NOT a verified Russian surname and
  // given name. Convert only an old import-only synthetic name in-place.
  for (const person of people) {
    if (person.lastName !== 'Ксы' || person.firstName !== 'Аперол' ||
      person.historicalAlias || person.middleName || !safeHistorical(person)) continue;
    try {
      await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('USD_IMPORT_IDENTITIES'))::text`;
        const current = await tx.participant.findMany({
          where: { id: { in: [person.id] } },
          include: { user: { select: { id: true } }, registrations: { select: { source: true, stageId: true } } },
        });
        if (current.length !== 1 || !safeHistorical(current[0]) ||
          current[0].lastName !== 'Ксы' || current[0].firstName !== 'Аперол' ||
          current[0].middleName || current[0].historicalAlias)
          throw new Error('Профиль изменился до проверки псевдонима');
        const stageIds = [...new Set(current[0].registrations.map(item => item.stageId))];
        if (stageIds.length !== 1 || !stageIds[0])
          throw new Error('Архивное название встречается в разных этапах: требуется подтверждение');
        const attachedEmail = await tx.participantLegacyEmail.findMany({
          where: { participantId: person.id },
        });
        if (attachedEmail.length)
          throw new Error('Присутствует архивный email: автоматическое переименование запрещено');
        const alias = 'Ksy Aperol';
        const legacyId = 'HISTORICAL_ALIAS:' + createHash('sha256')
          .update(stageIds[0] + ':' + archivalAliasKey(alias)).digest('hex');
        const other = await tx.participant.findFirst({
          where: { legacyId, id: { not: person.id } },
          select: { id: true },
        });
        if (other) throw new Error('Архивный псевдоним уже занят другой карточкой');
        await tx.participant.update({
          where: { id: person.id },
          data: { legacyId, historicalAlias: archivalAliasDisplayLabel(alias), lastName: archivalAliasDisplayLabel(alias), firstName: '', middleName: null },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000, maxWait: 15000 });
      summary.namesCorrected++;
    } catch (error) {
      summary.skipped.push({
        label: 'Ксы Аперол',
        reason: error instanceof Error ? error.message : 'Неизвестная ошибка',
      });
    }
  }
  return summary;
}
