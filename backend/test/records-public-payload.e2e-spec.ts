import { randomUUID } from 'node:crypto';
import { RecordsService } from '../src/records/records.service';
import { PrismaService } from '../src/prisma/prisma.service';
const suite = process.env.USD_RECORDS_PAYLOAD_TEST === '1' ? describe : describe.skip;
suite('bounded public records on isolated PostgreSQL 18', () => {
 let db: PrismaService, service: RecordsService;
 const ids = Object.fromEntries(['season','stage','direction','class','participant','car','configuration','version','registration','number','registrationClass','result','record'].map(key => [key, randomUUID()]));
 const snapshot = { revisionId:'synthetic-snapshot', blocks:[{type:'paragraph',text:'SYNTHETIC_RULES '.repeat(20000)}] };
 beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['postgres:','postgresql:'].includes(url.protocol) || !['127.0.0.1','localhost'].includes(url.hostname) || !/^\/usd_(?:records_payload|identity_auth)_[a-z0-9_]+$/.test(url.pathname) || url.search || url.hash) throw new Error('Disposable loopback payload/auth database required');
  db = new PrismaService(); await db.$connect();
  const v = await db.$queryRawUnsafe<Array<{version:string}>>("SELECT current_setting('server_version_num') AS version");
  if (Number(v[0].version)<180000 || Number(v[0].version)>=190000) throw new Error('PostgreSQL18 required');
  if (await db.participant.count() || await db.record.count() || await db.season.count()) throw new Error('Refusing nonempty payload fixture');
  await db.season.create({data:{id:ids.season,name:'Synthetic season',year:2098}});
  await db.direction.create({data:{id:ids.direction,name:'SPL'}});
  await db.class.create({data:{id:ids.class,directionId:ids.direction,name:'Synthetic class',code:'PAYLOAD-'+ids.class,unit:'DB'}});
  await db.stage.create({data:{id:ids.stage,seasonId:ids.season,stageNumber:1,name:'Synthetic stage',date:new Date('2098-01-01'),status:'COMPLETED',resultsPublishedAt:new Date(),rulesSnapshot:snapshot}});
  await db.participant.create({data:{id:ids.participant,firstName:'Synthetic',lastName:'Payload',isPublic:true}});
  await db.car.create({data:{id:ids.car,participantId:ids.participant,brand:'Synthetic',model:'Car',registrationNumber:'A123AA72',isPublic:true}});
  await db.carConfiguration.create({data:{id:ids.configuration,carId:ids.car,name:'Synthetic configuration'}});
  await db.carConfigurationVersion.create({data:{id:ids.version,configurationId:ids.configuration,version:1}});
  await db.registration.create({data:{id:ids.registration,participantId:ids.participant,carId:ids.car,stageId:ids.stage,configurationVersionId:ids.version,configurationSnapshot:{},participantNumber:1,source:'PRE_REGISTRATION'}});
  await db.registrationNumber.create({data:{id:ids.number,registrationId:ids.registration,stageId:ids.stage,number:1,isPrimary:true}});
  await db.registrationClass.create({data:{id:ids.registrationClass,registrationId:ids.registration,classId:ids.class,numberId:ids.number}});
  await db.result.create({data:{id:ids.result,registrationId:ids.registration,registrationClassId:ids.registrationClass,value:155,unit:'DB'}});
  await db.record.create({data:{id:ids.record,classId:ids.class,seasonId:ids.season,stageId:ids.stage,resultId:ids.result,participantId:ids.participant,carId:ids.car,value:155,unit:'DB',achievedAt:new Date('2098-01-01'),isCurrent:true}});
  service = new RecordsService(db);
 });
 afterAll(async () => {
  if (!db) return;
  await db.record.deleteMany({where:{id:ids.record}});
  await db.registration.deleteMany({where:{id:ids.registration}});
  await db.car.deleteMany({where:{id:ids.car}});
  await db.participant.deleteMany({where:{id:ids.participant}});
  await db.stage.deleteMany({where:{id:ids.stage}});
  await db.class.deleteMany({where:{id:ids.class}});
  await db.direction.deleteMany({where:{id:ids.direction}});
  await db.season.deleteMany({where:{id:ids.season}});
  await db.$disconnect();
 });
 it('keeps public metadata compact and preserves the full stored regulation', async () => {
  for (const rows of [await service.findCurrent(),await service.findAll(),await service.findByClass(ids.class),await service.findBySeason(ids.season)]) {
   expect(rows).toHaveLength(1);
   expect(rows[0].stage).toMatchObject({id:ids.stage,name:'Synthetic stage',season:{year:2098}});
   expect(rows[0].result?.registration?.stage).toMatchObject({id:ids.stage,name:'Synthetic stage'});
   expect('rulesSnapshot' in (rows[0].stage ?? {})).toBe(false);
   expect('rulesSnapshot' in (rows[0].result?.registration?.stage ?? {})).toBe(false);
   expect(Buffer.byteLength(JSON.stringify(rows))).toBeLessThan(64000);
  }
  expect((await db.stage.findUniqueOrThrow({where:{id:ids.stage}})).rulesSnapshot).toEqual(snapshot);
 });
});
