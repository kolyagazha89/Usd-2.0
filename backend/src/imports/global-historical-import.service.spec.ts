import { jest } from '@jest/globals';
import { GlobalHistoricalImportService } from './global-historical-import.service';
import { NameNormalizerService } from '../common/names/name-normalizer.service';
import { Roles } from '../auth/roles.decorator';
import { GlobalHistoricalImportController } from './global-historical-import.controller';
const sourceStage = { year: 2026, number: 3, name: 'Archive', city: 'City', date: '2026-05-16', registrations: [], results: [{ 'ФИО': 'Петров Иван' }], registrationSheet: 'Registration', resultsSheet: 'Results' };
const plan:any = { version: 1, sourceHash: 'source-hash', sourceWorkbooks: [], sourceResults: 1, registrationRows: 0, people: [], stages: [sourceStage] };
const progress = (status = 'PENDING'):any => ({ updatedAt: '', stages: [{ name: 'Archive', year: 2026, number: 3, sourceRows: 1, status, imported: status === 'DONE' ? 1 : 0, kept: 0, aliases: 0, review: [], resultIds: status === 'DONE' ? ['result'] : [], ...(status === 'DONE' ? { jobId: 'job' } : {}) }] });
const batch = (state = 'RUNNING'):any => ({ id: 'batch', status: state, sourceHash: 'source-hash', plan, progress: progress(state === 'COMPLETED' ? 'DONE' : 'PENDING'), createdByUserId: null, createdAt: new Date(), updatedAt: new Date() });
const request:any = { user: { sub: 'admin', role: 'ADMIN' } };
function make(db:any, imports:any = {}) {
 if (!db.participant) db.participant = { findMany: jest.fn(async () => []) };
 const service:any = new GlobalHistoricalImportService(db, imports, new NameNormalizerService());
 jest.spyOn(service, 'loadPlan').mockReturnValue(plan);
 return service;
}
describe('durable global import coordination', () => {
 it('returns an active batch for a repeated click instead of creating duplicate work', async () => {
  const active = batch(); const db:any = { historicalImportBatch: { findUnique: jest.fn(async () => active), create: jest.fn() } };
  const sut = make(db); const launch = jest.spyOn(sut, 'launch').mockImplementation(() => {});
  expect((await sut.start(request)).id).toBe('batch');
  expect(db.historicalImportBatch.create).not.toHaveBeenCalled(); expect(launch).toHaveBeenCalledTimes(1);
 });
 it('does not rerun a completed source while the actual result IDs are intact', async () => {
  const completed = batch('COMPLETED'); const db:any = { historicalImportBatch: { findUnique: jest.fn(async () => null), findFirst: jest.fn(async () => completed), create: jest.fn() }, result: { count: jest.fn(async () => 1) } };
  const sut = make(db); const launch = jest.spyOn(sut, 'launch').mockImplementation(() => {});
  expect((await sut.start(request)).status).toBe('COMPLETED'); expect(launch).not.toHaveBeenCalled(); expect(db.result.count).toHaveBeenCalled();
 });
 it('rechecks a completed stage after a separate reset removed its results', async () => {
  const completed = batch('COMPLETED'); const updateMany = jest.fn(async ({ data }:any) => { Object.assign(completed,data); return {count:1}; });
  const db:any = { historicalImportBatch: { findUnique: jest.fn(async () => null), findFirst: jest.fn(async () => completed), updateMany, findUniqueOrThrow:jest.fn(async()=>completed) }, result: { count: jest.fn(async () => 0) } };
  const sut = make(db); jest.spyOn(sut, 'launch').mockImplementation(() => {});
  const next = await sut.start(request); expect(next.imported).toBe(0); expect(next.stages[0].jobId).toBeUndefined(); expect(next.status).toBe('RUNNING');
 });
 it('refreshes the persisted source plan and discards stale previews of unfinished stages after identity correction', async () => {
  const old = batch('NEEDS_REVIEW');
  old.plan = { ...plan, identityRulesVersion: 1 };
  old.progress.stages[0] = {
    ...old.progress.stages[0], status: 'FAILED', jobId: 'old-preview',
    imported: 1, resultIds: ['old-result'], review: [{ sheet: 'Results', row: 1, name: 'Латишев Малсим', reason: 'pending' }],
    error: 'old error',
  };
  const newerPlan = { ...plan, identityRulesVersion: 2 };
  const updateMany = jest.fn(async ({ data }:any) => {
    Object.assign(old, data);
    return {count:1};
  });
  const db:any = {
    historicalImportBatch: {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => old),
      updateMany,
      findUniqueOrThrow: jest.fn(async () => old),
    },
  };
  const sut = make(db);
  jest.spyOn(sut, 'loadPlan').mockReturnValue(newerPlan);
  jest.spyOn(sut, 'launch').mockImplementation(() => {});
  const refreshed = await sut.start(request);
  expect(refreshed.status).toBe('RUNNING');
  expect(old.plan.identityRulesVersion).toBe(2);
  expect(old.progress.stages[0]).toMatchObject({
    status: 'PENDING', imported: 0, resultIds: [], review: [],
  });
  expect(old.progress.stages[0].jobId).toBeUndefined();
  expect(old.progress.stages[0].error).toBeUndefined();
  expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ plan: newerPlan }),
  }));
 });
 it('does not reset a lease when a new batch appears between active and previous reads',async()=>{
  const running=batch();const db:any={historicalImportBatch:{findUnique:jest.fn(async()=>null),findFirst:jest.fn(async()=>running),updateMany:jest.fn(),create:jest.fn()}};
  const sut=make(db);jest.spyOn(sut,'launch').mockImplementation(()=>{});
  expect((await sut.start(request)).id).toBe(running.id);expect(db.historicalImportBatch.updateMany).not.toHaveBeenCalled();expect(db.historicalImportBatch.create).not.toHaveBeenCalled();
 });
 it('uses an atomic resume so concurrent requests cannot clear a worker lease',async()=>{
  const old=batch('NEEDS_REVIEW');const running={...old,status:'RUNNING'};
  const db:any={historicalImportBatch:{findUnique:jest.fn(async()=>null),findFirst:jest.fn(async()=>old),updateMany:jest.fn(async()=>({count:0})),findUniqueOrThrow:jest.fn(async()=>running)}};
  const sut=make(db);jest.spyOn(sut,'launch').mockImplementation(()=>{});
  expect((await sut.start(request)).status).toBe('RUNNING');expect(db.historicalImportBatch.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:{id:'batch',status:'NEEDS_REVIEW',activeKey:null}}));
 });
 it('does not let a second process steal an unexpired worker lease', async () => {
  const active = { ...batch(), leaseUntil: new Date(Date.now() + 60_000) };
  const db:any = { historicalImportBatch: { updateMany: jest.fn(async () => ({ count: 0 })), findUnique: jest.fn(async () => active), findUniqueOrThrow: jest.fn() } };
  const sut = make(db); await sut.run('batch'); sut.onModuleDestroy(); expect(db.historicalImportBatch.findUniqueOrThrow).not.toHaveBeenCalled();
 });
 it('records a failed stage and continues other stages without claiming complete success', async () => {
  const b = batch(); b.plan = { ...plan, stages: [sourceStage, { ...sourceStage, number: 4 }] }; b.progress.stages.push({ ...progress().stages[0], number: 4 });
  const db:any = { historicalImportBatch: { updateMany: jest.fn(async () => ({ count: 1 })), findUniqueOrThrow: jest.fn(async () => b) } };
  const sut = make(db); const work = jest.spyOn(sut, 'importStage').mockImplementation(async (_b:any, stage:any, p:any) => { if (stage.number === 3) throw Error('controlled failure'); p.status = 'DONE'; p.imported = 1; });
  await sut.run('batch'); expect(work).toHaveBeenCalledTimes(2);
  expect(db.historicalImportBatch.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'NEEDS_REVIEW', activeKey: null }) }));
  expect(b.progress.stages[0].error).toBe('controlled failure'); expect(b.progress.stages[1].status).toBe('DONE');
 });
 it('requires ADMIN at the global controller boundary', () => {
  const key = 'roles';
  expect(Reflect.getMetadata(key, GlobalHistoricalImportController)).toEqual(['ADMIN']);
  expect(Roles).toBeDefined();
 });
});

describe('per-stage source accounting and protected profiles', () => {
 it('preserves a protected row, keeps an existing result, and imports a raw alias without losing source rows', async () => {
  const row = (id:string, name:string, extra:any = {}):any => ({ id, type: 'RESULT', rowNumber: Number(id.slice(1)), status: 'WARNING', rawData: { 'ФИО': name, _archiveOriginalName: name, _archiveRow: Number(id.slice(1)) + 1, _archiveSheet: 'Results' }, normalizedData: { participant: { source: 'DATABASE', status: 'NEW', matches: [] }, participantNumber: Number(id.slice(1)), class: { classId: 'class' }, result: 150, place: 1, car: {}, ...extra }, resolution: null, registrationId: null, classId: null });
  const rows = [row('r1', 'Петров Иван'), row('r2', 'Сидоров Пётр', { existingResult: { state: 'SAME' } }), row('r3', '34 Sound')]; rows[1].status='READY';
  const job:any = { id: 'job', rows };
  const db:any = { importJob: { findUnique: jest.fn(async () => job), findUniqueOrThrow: jest.fn(async () => job) }, participant: { findMany: jest.fn(async () => [{ id: 'protected', lastName: 'Петров', firstName: 'Иван', middleName: null }]) }, importRow: { update: jest.fn(async ({ where, data }:any) => Object.assign(rows.find(r => r.id === where.id)!, data)) }, result: { findMany: jest.fn(async () => [{ id: 'a' }, { id: 'b' }]) } };
  const imports:any = { resolveImportRow: jest.fn(async (_j:string, id:string, resolution:any) => Object.assign(rows.find(r => r.id === id)!, { status: 'RESOLVED', resolution })), commitImport: jest.fn(async () => { for (const r of rows.filter(r => r.status === 'RESOLVED')) Object.assign(r, { status: 'COMMITTED', registrationId: r.id, classId: 'class' }); }) };
  const sut = make(db, imports); jest.spyOn(sut, 'ensureStage').mockResolvedValue({ id: 'stage' });
  const p = { ...progress().stages[0], jobId: 'job', sourceRows: 3 }; const stage:any = { ...sourceStage, results: rows.map(r => r.rawData) };
  await sut.importStage({ id: 'batch', createdByUserId: null }, stage, p, () => false);
  expect(p.imported).toBe(2); expect(p.review).toHaveLength(1); expect(p.review[0].name).toBe('Петров Иван'); expect(p.aliases).toBe(1); expect(p.kept).toBe(1); expect(p.status).toBe('REVIEW');
  expect(db.importRow.update).toHaveBeenCalledWith({where:{id:'r2'},data:{status:'WARNING',warnings:[]}});
  expect(rows[0].status).toBe('WARNING'); expect(rows[2].resolution.participant).toEqual({ action: 'CREATE_ALIAS', fullName: '34 Sound' });
  expect(imports.commitImport).toHaveBeenCalledWith('job', undefined, { allowHistoricalPartial: true });
  expect(p.imported + p.review.length).toBe(3);
 });
 it('reuses the persisted job on recovery instead of previewing and committing it twice', async () => {
  const rows:any[] = [{ id: 'r', type: 'RESULT', status: 'COMMITTED', registrationId: 'reg', classId: 'class', resolution: {} }];
  const job:any = { id: 'job', rows };
  const db:any = { importJob: { findUnique: jest.fn(async () => job), findUniqueOrThrow: jest.fn(async () => job) }, participant: { findMany: jest.fn(async () => []) }, result: { findMany: jest.fn(async () => [{ id: 'result' }]) } };
  const imports:any = { previewStage: jest.fn(), commitImport: jest.fn() };
  const sut = make(db, imports); jest.spyOn(sut, 'ensureStage').mockResolvedValue({ id: 'stage' });
  const p:any = { ...progress().stages[0], jobId: 'job' };
  await sut.importStage({ id: 'batch', createdByUserId: null }, sourceStage, p, () => false);
  expect(p.status).toBe('DONE'); expect(p.imported).toBe(1); expect(imports.previewStage).not.toHaveBeenCalled(); expect(imports.commitImport).not.toHaveBeenCalled();
 });
});


describe('adopting empty test stages for archival import', () => {
 const storedStage = () => ({
   id: 'test-stage', seasonId: 'season', stageNumber: 3, legacyId: 'USD_TEST_123',
   date: new Date('2026-05-16T12:00:00.000Z'), registrationOpen: false,
   isDeleted: false, name: 'Testing', city: 'City', status: 'DRAFT',
 });
 const mockDb = (options: { registrationCount?: number; recordCount?: number; convertedCount?: number; date?: Date } = {}) => {
   const target = storedStage();
   if (options.date) target.date = options.date;
   const updateMany = jest.fn(async () => ({ count: options.convertedCount ?? 1 }));
   const findUniqueOrThrow = jest.fn(async () => ({ ...target, legacyId: null, name: sourceStage.name, status: 'PUBLISHED' }));
   const db:any = {
     season: { upsert: jest.fn(async () => ({ id: 'season' })) },
     stage: { findUnique: jest.fn(async () => target), updateMany, findUniqueOrThrow },
     registration: { count: jest.fn(async ({ where }:any) => where.source ? 0 : options.registrationCount ?? 0) },
     result: { count: jest.fn(async () => 0) },
     record: { count: jest.fn(async () => options.recordCount ?? 0) },
     disqualification: { count: jest.fn(async () => 0) },
     participantStageInspection: { count: jest.fn(async () => 0) },
     registrationNumber: { count: jest.fn(async () => 0) },
     class: { findMany: jest.fn(async () => []) },
     stageClass: { upsert: jest.fn() },
   };
   return { db, updateMany, findUniqueOrThrow };
 };
 it('converts an otherwise empty USD_TEST_ stage to the matching published archive', async () => {
   const { db, updateMany, findUniqueOrThrow } = mockDb();
   const sut = make(db, { historicalClassName: (s:string) => s });
   const result = await sut.ensureStage(sourceStage);
   expect(result.legacyId).toBeNull();
   expect(findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 'test-stage' } });
   expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
     where: expect.objectContaining({
       legacyId: 'USD_TEST_123', registrations: { none: {} },
       records: { none: {} }, disqualifications: { none: {} },
       participantInspections: { none: {} }, registrationNumbers: { none: {} },
     }),
     data: { legacyId: null, name: sourceStage.name, city: sourceStage.city, status: 'PUBLISHED' },
   }));
 });
 it('refuses a test stage with import registrations even if ordinary registrations are zero', async () => {
   const { db, updateMany } = mockDb({ registrationCount: 1 });
   const sut = make(db);
   await expect(sut.ensureStage(sourceStage)).rejects.toThrow('тестовый этап не пуст (регистрации: 1)');
   expect(updateMany).not.toHaveBeenCalled();
 });
 it('protects records linked to an otherwise registration-free test stage', async () => {
   const { db, updateMany } = mockDb({ recordCount: 2 });
   const sut = make(db);
   await expect(sut.ensureStage(sourceStage)).rejects.toThrow('рекорды: 2');
   expect(updateMany).not.toHaveBeenCalled();
 });
 it('keeps the original stage if another process adds records during conversion', async () => {
   const { db, updateMany } = mockDb({ convertedCount: 0 });
   const sut = make(db);
   await expect(sut.ensureStage(sourceStage)).rejects.toThrow('Состав тестового этапа изменился');
   expect(updateMany).toHaveBeenCalledTimes(1);
 });
 it('does not adopt a test stage with a different archive date', async () => {
   const { db, updateMany } = mockDb({ date: new Date('2026-05-17T12:00:00.000Z') });
   const sut = make(db);
   await expect(sut.ensureStage(sourceStage)).rejects.toThrow('дата этапа 2026-05-17 не совпадает');
   expect(updateMany).not.toHaveBeenCalled();
 });
});
