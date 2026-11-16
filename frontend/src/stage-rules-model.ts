export function selectPublicStageRules<T extends { blocks?: unknown[] }>(
  currentPublished: T | null | undefined,
  stageSnapshot: T | null | undefined,
  preferHistorical = false,
): { document: T | null; source: 'current' | 'historical' | 'unavailable' } {
  // A completed stage keeps its event-time rulebook. Active stages show the
  // current publication, while the immutable stage snapshot stays in the DB.
  if (preferHistorical && stageSnapshot && Array.isArray(stageSnapshot.blocks) && stageSnapshot.blocks.length > 0) {
    return { document: stageSnapshot, source: 'historical' };
  }
  if (currentPublished && Array.isArray(currentPublished.blocks) && currentPublished.blocks.length > 0) {
    return { document: currentPublished, source: 'current' };
  }
  if (stageSnapshot && Array.isArray(stageSnapshot.blocks) && stageSnapshot.blocks.length > 0) {
    return { document: stageSnapshot, source: 'historical' };
  }
  return { document: null, source: 'unavailable' };
}
