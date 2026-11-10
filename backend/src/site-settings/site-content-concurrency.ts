import { createHash } from 'node:crypto';

/** A per-section CAS token: unrelated branding or catalog writes do not
 * invalidate an ADMIN content editor's draft. No tokens or drafts logged. */
export const siteContentRevision=(content:unknown)=>
 createHash('sha256').update(JSON.stringify(Array.isArray(content)?content:[])).digest('hex');
