/** Give unit-test Prisma doubles the same callback shape as interactive transactions. */
export function withSettingsTransaction<T>(mock:T):T {
 const db=mock as any;
 db.$executeRaw=async()=>0;
 db.$transaction=async (callback:(tx:any)=>Promise<unknown>)=>callback(db);
 return mock;
}
