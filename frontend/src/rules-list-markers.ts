/** Shared numbering for DOCX regulations across the public rules, stage snapshots
 * and the light admin preview. Compute against the original document so search
 * never renumbers a partially visible list.
 *
 * DOCX parsing currently preserves list depth and ordered/unordered status, not
 * Word's custom start values or numbering IDs. Consecutive lists separated by a
 * non-list block are therefore treated as distinct sequences.
 */
export type RulesListBlock = { type: string; ordered?: boolean; level?: number };

export function rulesListMarkers(blocks: readonly RulesListBlock[]): Array<string | null> {
  const counters: number[] = [];
  const orderedAtLevel: boolean[] = [];

  return blocks.map(block => {
    if (block.type !== 'list-item') {
      counters.length = 0;
      orderedAtLevel.length = 0;
      return null;
    }
    const rawLevel = typeof block.level === 'number' && Number.isFinite(block.level) ? block.level : 0;
    const level = Math.max(0, Math.min(8, Math.trunc(rawLevel)));
    counters.length = level + 1;
    orderedAtLevel.length = level + 1;
    if (block.ordered !== true) {
      counters[level] = 0;
      orderedAtLevel[level] = false;
      return '•';
    }
    if (orderedAtLevel[level] !== true) counters[level] = 0;
    orderedAtLevel[level] = true;
    counters[level] = (counters[level] || 0) + 1;
    return String(counters[level]) + '.';
  });
}
