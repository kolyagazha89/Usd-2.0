import {historicalProjectKey,historicalProjectLabels} from '../common/names/historical-project-labels';
import { NameNormalizerService } from '../common/names/name-normalizer.service';

/** Normalize only verified business-name formatting, never fuzzy-match people. */
export function archivalAliasKey(rawAlias: string): string {
  const lower = rawAlias.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru');
  const compact = lower.replace(/[\s._-]+/g, '');
  const known=historicalProjectKey(rawAlias);
  if(known==='ksyaperol')return 'ksy aperol';
  if(known)return known;
  return new Set(['34sound', 'bassmarket', 'caraudiobryansk']).has(compact)
    ? compact : lower;
}

/**
 * Use a source-verified Cyrillic display label for an archival *alias*.
 * Registration (final Volgograd 2026) sticker 142 lists "Ксю Апероль"
 * for Results "Ksy Aperol" on the same car (Ford Focus 2).
 * This is a display repair, NOT a verified surname/given name.
 */
export function archivalAliasDisplayLabel(rawAlias: string): string {
  if (rawAlias.trim().toLocaleLowerCase('ru') === 'ksy aperol') return 'Ксю Апероль';
  return rawAlias;
}

type ImportResultRow = {
  id: string;
  type: string;
  rawData: unknown;
  normalizedData: unknown;
};

/**
 * Same alias + same class + DIFFERENT source stickers is conflicting evidence.
 * Keep each sticker in its own stage-scoped archival identity. Do not rewrite
 * results, guess legal FIO, or merge with a similarly named participant.
 */
export function historicalAliasStickerDiscriminators(
  rows: ImportResultRow[],
  normalizer: NameNormalizerService,
): Map<string, string> {
  type AliasRow = { id: string; aliasKey: string; classKey: string; stickerKey: string };
  const aliases: AliasRow[] = [];
  const stickersByAliasClass = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.type !== 'RESULT') continue;
    const raw = row.rawData as Record<string, unknown> | null;
    const normalized = row.normalizedData as Record<string, any> | null;
    const label = String(raw?._archiveOriginalName ?? raw?.['ФИО'] ?? normalized?.participant?.rawName ?? '').trim();
    if (!label || !normalizer.inspect(label).needsReview) continue;
    const aliasKey = archivalAliasKey(label);
    const classKey = String(normalized?.class?.classId ?? raw?.['Класс'] ?? '').trim().toLocaleLowerCase('ru');
    // Prefer original printed sticker, not a new fallback number allocated for an import.
    const printed = Number(raw?.['Номер'] ?? raw?.['Номер участника'] ?? normalized?.participantNumber);
    const stickerKey = Number.isSafeInteger(printed) && printed > 0
      ? 'number:' + printed
      : 'row:' + String(raw?._archiveRowKey ?? row.id);
    const groupKey = aliasKey + '\u0000' + classKey;
    const group = stickersByAliasClass.get(groupKey) ?? new Set<string>();
    group.add(stickerKey);
    stickersByAliasClass.set(groupKey, group);
    aliases.push({ id: row.id, aliasKey, classKey, stickerKey });
  }
  const ambiguousLabels = new Set<string>();
  for (const alias of aliases) {
    if ((stickersByAliasClass.get(alias.aliasKey + '\u0000' + alias.classKey)?.size ?? 0) > 1) {
      ambiguousLabels.add(alias.aliasKey);
    }
  }
  const discriminators = new Map<string, string>();
  for (const alias of aliases) {
    if (ambiguousLabels.has(alias.aliasKey)) discriminators.set(alias.id, alias.stickerKey);
  }
  return discriminators;
}

/**
 * These repeated archival labels represent one performer/project identity
 * across events. Only known, exact labels are eligible. The newer GitHub
 * Results source removed the conflicting 2025 Bassmarket sticker 105;
 * Bassmarket can now safely share an identity across stages.
 */
export const globalHistoricalAliasLabels: Readonly<Record<string, string>> = Object.fromEntries(
 Object.entries(historicalProjectLabels).filter(([key])=>key!=='ksyaperol'),
);

export function globalHistoricalAliasKey(label: string): string | null {
  const key=historicalProjectKey(label);
  return key && Object.hasOwn(globalHistoricalAliasLabels,key)?key:null;
}
