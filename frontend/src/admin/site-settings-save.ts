const IMMUTABLE_METADATA = new Set(['updatedAt', '_newsRevision', '_partnersRevision']);

/**
 * Form drafts can outlive changes made by other admins and independent CMS
 * editors. Send only modified top-level settings sections to the PATCH API.
 */
export function siteSettingsChangedSections(
  previous: Record<string, unknown>,
  current: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [section, value] of Object.entries(current)) {
    if (IMMUTABLE_METADATA.has(section)) continue;
    if (JSON.stringify(previous[section]) !== JSON.stringify(value)) result[section] = value;
  }
  if (Object.prototype.hasOwnProperty.call(result, 'news')) result._newsRevision = current._newsRevision;
  if (Object.prototype.hasOwnProperty.call(result, 'partners')) result._partnersRevision = current._partnersRevision;
  return result;
}
