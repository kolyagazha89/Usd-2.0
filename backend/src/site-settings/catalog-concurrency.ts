import { createHash } from 'node:crypto';

export const catalogRevision=(catalogs:unknown)=>createHash('sha256').update(JSON.stringify(catalogs??{})).digest('hex');
export async function lockSiteSettings(tx:any) {
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('usd-site-settings'))`;
}
