export function selectPublicStageRules<T extends { blocks?: unknown[] }>(
  currentPublished: T | null | undefined,
  stageSnapshot: T | null | undefined,
): { document: T | null; source: 'current' | 'historical' | 'unavailable' } {
  if (currentPublished && Array.isArray(currentPublished.blocks) && currentPublished.blocks.length > 0) {
    return { document: currentPublished, source: 'current' };
  }
  if (stageSnapshot && Array.isArray(stageSnapshot.blocks) && stageSnapshot.blocks.length > 0) {
    return { document: stageSnapshot, source: 'historical' };
  }
  return { document: null, source: 'unavailable' };
}
