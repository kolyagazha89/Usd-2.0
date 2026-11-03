/** Preserve the immutable entry-day snapshot; later documentation is an addendum. */
export function configurationStillPending(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
  const data = snapshot as Record<string, unknown>;
  if (data.configurationPending !== true) return false;
  const completed = data.postStageCompletion;
  return !completed || typeof completed !== 'object' || Array.isArray(completed) ||
    typeof (completed as Record<string, unknown>).versionId !== 'string' ||
    !(completed as Record<string, string>).versionId.trim();
}
