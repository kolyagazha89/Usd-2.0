import { ArchivePlan, archivePersonName, archivePlateKey, archiveNameKey, approvedHistoricalNamePairs } from './global-historical-plan';
import { NameNormalizerService } from '../common/names/name-normalizer.service';

export type HistoricalDuplicateCandidate = {
  left: string;
  right: string;
  reason: string;
  sharedPlates: string[];
  resultRows: [number, number];
};
export type HistoricalAliasGroup = {
  label: string;
  variants: string[];
  stages: string[];
  resultRows: number;
};

/**
 * A READ-ONLY review report. Edit distance must never become an identity
 * decision: a shared surname, plate, nickname or similar FIO does not prove
 * that two results belong to the same human being.
 */
export function auditHistoricalDuplicates(plan: ArchivePlan, names: NameNormalizerService) {
  const display = plan.people.map(person => {
    const name = archivePersonName(person.names[0] ?? '', names);
    const parts = name.split(/\s+/).filter(Boolean);
    const inspect = names.inspect(name);
    return {
      ...person,
      display: name,
      personName: parts.length === 2 && !inspect.needsReview && !/[0-9]/.test(name),
      firstName: parts[1] ?? '',
      surname: parts[0] ?? '',
      plateKeys: new Set(person.cars.map(car => archivePlateKey(car.plate)).filter(key => key.length >= 6)),
    };
  });
  const editDistance = (a: string, b: string): number => {
    const prev = Array.from({ length: b.length + 1 }, (_, n) => n);
    for (let i = 1; i <= a.length; i++) {
      let before = prev[0];
      prev[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const old = prev[j];
        prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, before + (a[i - 1] === b[j - 1] ? 0 : 1));
        before = old;
      }
    }
    return prev[b.length];
  };
  const possiblePeople: HistoricalDuplicateCandidate[] = [];
  for (let i = 0; i < display.length; i++) {
    const a = display[i];
    if (!a.personName) continue;
    for (let j = i + 1; j < display.length; j++) {
      const b = display[j];
      if (!b.personName || a.key === b.key) continue;
      const surname = editDistance(a.surname.toLowerCase(), b.surname.toLowerCase());
      const first = editDistance(a.firstName.toLowerCase(), b.firstName.toLowerCase());
      // Only near spellings, never a loose "same first name" match.
      if (!((surname === 0 && first <= 2) ||
        (first === 0 && surname <= 2) ||
        (surname <= 1 && first <= 1))) continue;
      const sharedPlates = [...a.plateKeys].filter(plate => b.plateKeys.has(plate));
      possiblePeople.push({
        left: a.display, right: b.display,
        reason: sharedPlates.length
          ? 'Похожие ФИО и совпадает госномер из справочника; личность нужно подтвердить'
          : 'Похожие написания ФИО; автоматическое объединение запрещено',
        sharedPlates,
        resultRows: [a.resultRows, b.resultRows],
      });
    }
  }
  possiblePeople.sort((a, b) => b.sharedPlates.length - a.sharedPlates.length ||
    (a.left + a.right).localeCompare(b.left + b.right, 'ru'));

  const labelGroups = new Map<string, {
    variants: Set<string>; stages: Set<string>; resultRows: number;
  }>();
  const labelCompact = (value: string) => value.normalize('NFKC')
    .toLocaleLowerCase('ru').replace(/[^a-zа-яё0-9]/gi, '');
  const recognizableLabels = new Set(['34sound', 'bassmarket', 'caraudiobryansk']);
  for (const stage of plan.stages) {
    for (const row of stage.results) {
      const raw = String(row._archiveOriginalName ?? row['ФИО'] ?? '').trim();
      const compact = labelCompact(raw);
      if (!recognizableLabels.has(compact) && !/(?:\bteam\b|\bsf\b|bassfix|sound)/i.test(raw)) continue;
      const current = labelGroups.get(compact) ?? {
        variants: new Set<string>(), stages: new Set<string>(), resultRows: 0,
      };
      current.variants.add(raw);
      current.stages.add(stage.year + ' · ' + stage.name);
      current.resultRows += 1;
      labelGroups.set(compact, current);
    }
  }
  const aliasesAcrossStages: HistoricalAliasGroup[] = [...labelGroups.values()]
    .filter(group => group.stages.size > 1 || group.variants.size > 1)
    .map(group => ({
      label: [...group.variants][0],
      variants: [...group.variants].sort((a, b) => a.localeCompare(b, 'ru')),
      stages: [...group.stages],
      resultRows: group.resultRows,
    }))
    .sort((a, b) => b.stages.length - a.stages.length || a.label.localeCompare(b.label, 'ru'));

  const confirmedPeople = approvedHistoricalNamePairs.flatMap(pair => {
    const key = archiveNameKey(pair.canonical, names);
    const person = plan.people.find(item => item.key === key);
    return person && person.names.length > 1
      ? [{ canonical: pair.canonical, variants: person.names, resultRows: person.resultRows }]
      : [];
  });

  return {
    sourcePeopleKeys: plan.people.length,
    confirmedPeople,
    possiblePeople,
    aliasesAcrossStages,
    policy: 'Совпадение имени, ника или автомобиля не доказывает личность. Список служит для ручной проверки, не для автоматического слияния.',
  };
}
