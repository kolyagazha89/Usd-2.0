import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { jest } from '@jest/globals';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import {JwtAuthGuard} from '../src/auth/jwt-auth.guard';
import {RolesGuard} from '../src/auth/roles.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalHistoricalImportService } from '../src/imports/global-historical-import.service';
import type { ArchivePlan } from '../src/imports/global-historical-plan';

describe('one-button global historical import with a real test database', () => {
 let app: INestApplication; let db: PrismaService; let service: GlobalHistoricalImportService;
 let adminToken: string; let participantToken: string; let protectedId: string; let sourceHash: string;
 let plan: ArchivePlan; let batchId: string;
 beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid');
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) throw Error('Integration test requires an isolated local PostgreSQL database');
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication(new ExpressAdapter()); app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true,forbidNonWhitelisted:true})); app.useGlobalGuards(app.get(JwtAuthGuard),app.get(RolesGuard)); await app.init();
  db = app.get(PrismaService); service = app.get(GlobalHistoricalImportService);
  const suffix = randomUUID(); sourceHash = 'e2e-' + suffix;
  const admin = await db.user.create({ data: { email: 'global-admin-' + suffix + '@example.invalid', passwordHash: 'not-used-by-jwt', role: 'ADMIN', emailVerifiedAt: new Date() } });
  const protectedPerson = await db.participant.create({ data: { lastName: 'Защищённый', firstName: 'Иван', phone: 'KEEP_PHONE', city: 'KEEP_CITY' } }); protectedId = protectedPerson.id;
  const participant = await db.user.create({ data: { email: 'global-participant-' + suffix + '@example.invalid', passwordHash: 'not-used-by-jwt', role: 'PARTICIPANT', participantId: protectedId, emailVerifiedAt: new Date() } });
  const jwt = app.get(JwtService);
  const options = { issuer: process.env.JWT_ISSUER ?? 'usd-2.0-api', audience: process.env.JWT_AUDIENCE ?? 'usd-2.0-client' };
  adminToken = jwt.sign({ sub: admin.id }, options); participantToken = jwt.sign({ sub: participant.id }, options);
  if (!await db.class.findFirst({ where: { name: 'Coffin', isActive: true } })) {
   const direction = await db.direction.create({ data: { name: 'Global E2E', legacyId: sourceHash } });
   await db.class.create({ data: { name: 'Coffin', code: 'GLOBAL_E2E_' + suffix, directionId: direction.id, unit: 'DB' } });
  }
  const result = (name:string, number:number, value:number, row:number) => ({ 'ФИО': name, 'Номер': number, 'Класс': 'Coffin', 'Результат': value, 'Место': 1, _archiveOriginalName: name, _archiveSheet: 'E2E Results', _archiveRow: row, _archiveRowKey: 'e2e:' + row });
  const helper = (vibration:string) => ({ 'Фамилия и имя': 'Тестов Алексей', 'Номер участника': 1, 'Модель автомобиля': 'E2E Car', 'Номер автомобиля': 'А123АА34', 'Виброизоляция': vibration });
  const first = { year: 4091, number: 1, name: 'Global E2E one', city: 'Test', date: '4091-05-01', registrationSheet: 'E2E one', resultsSheet: 'E2E Results', registrations: [helper('STP')], results: [result('Тестов Алексей', 1, 150, 2), result('Защищённый Иван', 2, 151, 3), result('34 Sound', 3, 140, 4)] };
  const second = { ...first, number: 2, name: 'Global E2E two', date: '4091-06-01', registrations: [helper('ComfortMat')], results: [result('Тестов Алексей', 1, 155, 5)] };
  const empty = { ...first, number: 3, name: 'Registration only', date: '4091-07-01', resultsSheet: null, results: [] };
  plan = { version: 1, sourceHash, sourceWorkbooks: [], sourceResults: 4, registrationRows: 3, stages: [first, second, empty], people: [] };
  jest.spyOn(service as any, 'loadPlan').mockReturnValue(plan);
 }, 120_000);
 afterAll(async () => { if (app) await app.close(); });
 const auth = () => ({ Authorization: 'Bearer ' + adminToken });
 const finish = async () => {
  const deadline = Date.now() + 90_000; let last:any; 
  while (Date.now() < deadline) {
   const response = await request(app.getHttpServer()).get('/imports/historical/global/' + batchId).set(auth()).expect(200);
   last=response.body; if (response.body.status !== 'RUNNING') return response.body;
   await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error('Global import did not settle: '+JSON.stringify(last));
 };
 it('requires ADMIN and refuses anonymous or participant execution', async () => {
  await request(app.getHttpServer()).post('/imports/historical/global/start').send({}).expect(401);
  await request(app.getHttpServer()).post('/imports/historical/global/start').set('Authorization', 'Bearer ' + participantToken).send({}).expect(403);
  expect(await db.historicalImportBatch.count({ where: { sourceHash } })).toBe(0);
 });
 it('runs all stages from one click, coalesces double clicks, preserves protected rows and versions', async () => {
  const [left, right] = await Promise.all([request(app.getHttpServer()).post('/imports/historical/global/start').set(auth()).send({}), request(app.getHttpServer()).post('/imports/historical/global/start').set(auth()).send({})]);
  expect(left.status).toBe(201); expect(right.status).toBe(201); expect(left.body.id).toBe(right.body.id); batchId = left.body.id;
  const report = await finish();
  expect({status:report.status,failed:report.stages.filter((stage:any)=>stage.status==='FAILED')}).toEqual({status:'NEEDS_REVIEW',failed:[]}); expect(report.imported).toBe(3); expect(report.needsReview).toBe(1); expect(report.failedStages).toBe(0); expect(report.aliases).toBe(1);
  expect(report.imported + report.needsReview).toBe(plan.sourceResults);
  expect(report.stages[2].status).toBe('NO_RESULTS');
  const people = await db.participant.findMany({ where: { lastName: 'Тестов', firstName: 'Алексей' }, include: { cars: true, registrations: { include: { configurationVersion: true, stage: true } } } });
  expect(people).toHaveLength(1); expect(people[0].cars).toHaveLength(1); expect(people[0].registrations).toHaveLength(2);
  const registrations = people[0].registrations.sort((a,b) => a.stage.stageNumber - b.stage.stageNumber);
  expect(registrations[0].configurationVersion?.vibrationIsolation).toBe('STP'); expect(registrations[1].configurationVersion?.vibrationIsolation).toBe('ComfortMat');
  expect(registrations[0].configurationVersionId).not.toBe(registrations[1].configurationVersionId);
  const protectedPerson = await db.participant.findUniqueOrThrow({ where: { id: protectedId }, include: { registrations: true } });
  expect(protectedPerson.phone).toBe('KEEP_PHONE'); expect(protectedPerson.city).toBe('KEEP_CITY'); expect(protectedPerson.registrations).toHaveLength(0);
  const downloaded = await request(app.getHttpServer()).get('/imports/historical/global/' + batchId + '/report').set(auth()).expect(200);
  expect(downloaded.body.sourceRows.flatMap((stage:any) => stage.rows)).toHaveLength(4);
  expect(await db.stage.count({ where: { season: { year: 4091 } } })).toBe(2);
 }, 120_000);
 it('restores status after reload and resumes without adding duplicate results', async () => {
  const before = await db.result.count({ where: { registration: { stage: { season: { year: 4091 } } } } });
  const latest = await request(app.getHttpServer()).get('/imports/historical/global/latest').set(auth()).expect(200); expect(latest.body.id).toBe(batchId);
  await request(app.getHttpServer()).post('/imports/historical/global/start').set(auth()).send({}).expect(201);
  const report = await finish(); expect(report.imported).toBe(3); expect(report.needsReview).toBe(1);
  expect(await db.result.count({ where: { registration: { stage: { season: { year: 4091 } } } } })).toBe(before);
  expect(await db.historicalImportBatch.count({ where: { sourceHash } })).toBe(1);
 }, 120_000);
 it('offers final 2026 correction at profile entry and preserves event snapshots after confirmation and later edits',async()=>{
  const person=await db.participant.findFirstOrThrow({where:{lastName:'Тестов',firstName:'Алексей'},include:{registrations:{include:{classes:true}}}});
  const original=person.registrations[0];
  const season=await db.season.upsert({where:{year:2026},update:{},create:{year:2026,name:'Final test'}});
  const stage=await db.stage.create({data:{seasonId:season.id,stageNumber:12,name:'Финал Волгоград',date:new Date('2026-09-12'),status:'COMPLETED'}});
  const final=await db.registration.create({data:{stageId:stage.id,participantId:person.id,carId:original.carId,participantNumber:1,source:'IMPORT',configurationVersionId:original.configurationVersionId,configurationSnapshot:original.configurationSnapshot as any}});
  const number=await db.registrationNumber.create({data:{registrationId:final.id,stageId:stage.id,number:1,isPrimary:true}});
  const cls=await db.registrationClass.create({data:{registrationId:final.id,classId:original.classes[0].classId,numberId:number.id}});
  await db.result.create({data:{registrationId:final.id,registrationClassId:cls.id,value:150,unit:'DB',isHistorical:true}});
  const account=await db.user.create({data:{email:'claim-'+randomUUID()+'@example.invalid',passwordHash:'unused',role:'PARTICIPANT',participantId:person.id,emailVerifiedAt:new Date()}});
  const token=app.get(JwtService).sign({sub:account.id},{issuer:process.env.JWT_ISSUER??'usd-2.0-api',audience:process.env.JWT_AUDIENCE??'usd-2.0-client'});
  const headers={Authorization:'Bearer '+token};
  const entry=await request(app.getHttpServer()).get('/configurations/me/final-2026').set(headers).expect(200);
  expect(entry.body.items).toHaveLength(1);expect(entry.body.items[0].confirmedAt).toBeNull();
  const body={name:'Финал 2026',vibrationIsolation:'Global',additionalDescription:'Подтвердил участник',headUnits:[],audioComponents:[],amplifiers:[],batteries:[],generators:[]};
  await request(app.getHttpServer()).post('/configurations/me/final-2026/'+final.id+'/confirm').set('Authorization','Bearer '+participantToken).send(body).expect(404);
  await request(app.getHttpServer()).post('/configurations/me/final-2026/'+final.id+'/confirm').set(headers).send({...body,audioComponents:[{brand:'Test',model:'Sub',quantity:0,type:'SUBWOOFER',direction:'SUB'}]}).expect(400);
  const confirmed=await request(app.getHttpServer()).post('/configurations/me/final-2026/'+final.id+'/confirm').set(headers).send(body).expect(201);
  const retry=await request(app.getHttpServer()).post('/configurations/me/final-2026/'+final.id+'/confirm').set(headers).send(body).expect(201);expect(retry.body.id).toBe(confirmed.body.id);
  const after=await db.registration.findUniqueOrThrow({where:{id:final.id},include:{configurationVersion:true}});
  expect(after.configurationVersionId).toBe(original.configurationVersionId);expect(after.configurationSnapshot).toEqual(original.configurationSnapshot);expect(after.configurationVersion.vibrationIsolation).toBe('STP');
  const reload=await request(app.getHttpServer()).get('/configurations/me/final-2026').set(headers).expect(200);expect(reload.body.items[0].confirmedAt).toBeTruthy();
  const correction=await db.carConfigurationVersion.findUniqueOrThrow({where:{id:confirmed.body.versionId}});
  await request(app.getHttpServer()).put('/configurations/'+correction.configurationId).set(headers).send({...body,vibrationIsolation:'Audior'}).expect(200);
  expect((await db.carConfigurationVersion.findUniqueOrThrow({where:{id:correction.id}})).vibrationIsolation).toBe('Global');
 },120_000);

});
