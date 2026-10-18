import { jest } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { createApplication } from '../src/application';
import { PrismaService } from '../src/prisma/prisma.service';
import { ResultsRankingService } from '../src/results/results-ranking.service';

describe('Production application boundaries', () => {
  let app: INestApplication;
  let db: PrismaService;
  let adminToken: string; let judgeToken: string; let participantToken: string;
  let person: string; let registration: string; let registrationClass: string;
  let stage: string; let classId: string; let direction: string; let season: string;
  const suffix = randomUUID(); const users: string[] = []; const cars: string[] = [];
  let customRole: string;
  const token = (id: string) => app.get(JwtService).signAsync({sub:id});

  beforeAll(async () => {
    // Refuse to use an arbitrary developer/production DB. CI supplies its own isolated service.
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (!['localhost','127.0.0.1'].includes(url.hostname) || !(url.pathname === '/usd_audit' || (process.env.CI === 'true' && url.pathname === '/usd'))) throw new Error('E2E requires the explicit isolated audit database (or the CI service)');
    app = await createApplication(false); await app.init(); db = app.get(PrismaService);
    customRole = (await db.role.create({data:{key:'test-'+suffix,name:'Test judge',permissions:{results:['view','create']}}})).id;
    for (const [name,role,customRoleId] of [['admin','ADMIN',null],['judge','PARTICIPANT',customRole],['participant','PARTICIPANT',null]] as const) {
      const u = await db.user.create({data:{email:name+'-'+suffix+'@example.invalid',passwordHash:'unused-in-token-tests',role,customRoleId,emailVerifiedAt:new Date()}});
      users.push(u.id);
    }
    [adminToken,judgeToken,participantToken] = await Promise.all(users.map(token));
    person = (await db.participant.create({data:{firstName:'Audit',lastName:suffix,isPublic:false}})).id;
    const car = await db.car.create({data:{participantId:person,brand:'Test',model:'Car',registrationCountry:'RU',registrationNumber:'А123АА77',isPublic:false}}); cars.push(car.id);
    const config = await db.carConfiguration.create({data:{carId:car.id,name:'Test',versions:{create:{version:1}}},include:{versions:true}});
    season = (await db.season.create({data:{name:'Test '+suffix,year:7000+Math.floor(Math.random()*2000)}})).id;
    stage = (await db.stage.create({data:{seasonId:season,stageNumber:1,name:'Test',date:new Date(),status:'PUBLISHED'}})).id;
    direction = (await db.direction.create({data:{name:'SPL'}})).id;
    classId = (await db.class.create({data:{directionId:direction,code:'test-'+suffix,name:'Limited Test',unit:'DB'}})).id;
    await db.stageClass.create({data:{stageId:stage,classId}});
    const reg = await db.registration.create({data:{stageId:stage,participantId:person,carId:car.id,configurationVersionId:config.versions[0].id,configurationSnapshot:{},participantNumber:1,source:'ON_SITE',inspection:{create:{status:'PASSED'}}}}); registration=reg.id;
    const num = await db.registrationNumber.create({data:{stageId:stage,registrationId:registration,number:1,isPrimary:true}});
    registrationClass = (await db.registrationClass.create({data:{registrationId:registration,classId,numberId:num.id}})).id;
  }, 30_000);

  afterAll(async () => {
    if (!app) return;
    jest.restoreAllMocks();
    if (db && stage) {
      await db.record.deleteMany({where:{stageId:stage}});
      await db.result.deleteMany({where:{registrationId:registration}});
      await db.registration.deleteMany({where:{stageId:stage}});
      await db.stage.delete({where:{id:stage}});
      await db.class.delete({where:{id:classId}}); await db.direction.delete({where:{id:direction}});
      await db.season.delete({where:{id:season}});
    }
    if (db) {
      if (person) { await db.carConfiguration.deleteMany({where:{carId:{in:cars}}}); await db.car.deleteMany({where:{participantId:person}}); await db.participant.delete({where:{id:person}}); }
      await db.auditLog.deleteMany({where:{userId:{in:users}}}); await db.user.deleteMany({where:{id:{in:users}}});
      if (customRole) await db.role.delete({where:{id:customRole}});
    }
    await app.close();
  }, 30_000);

  it('rejects writes from an untrusted browser origin before authentication', async () => {
    await request(app.getHttpServer()).post('/auth/login').set('Origin','https://untrusted.example.invalid').send({email:'x@example.invalid',password:'ignored'}).expect(403);
  });
  it('protects administrative API without authentication', async () => {
    await request(app.getHttpServer()).get('/statistics/dashboard').expect(401);
  });
  it('lets a custom judge read their own account and forbids user administration', async () => {
    await request(app.getHttpServer()).get('/auth/me').auth(judgeToken,{type:'bearer'}).expect(200);
    await request(app.getHttpServer()).get('/auth/admin/users').auth(judgeToken,{type:'bearer'}).expect(403);
  });
  it('does not reveal a private historical profile to another participant', async () => {
    const res = await request(app.getHttpServer()).post('/auth/profile/historical-candidates').auth(participantToken,{type:'bearer'}).send({fullName:suffix}).expect(201);
    expect(res.body.candidates).toEqual([]);
  });
  it('rejects invalid DTOs through the actual global validation pipe', async () => {
    await request(app.getHttpServer()).post('/results').auth(adminToken,{type:'bearer'}).send({registrationId:registration,registrationClassId:registrationClass,value:-1,confirmed:true,unexpected:true}).expect(400);
  });
  it('rolls back measurement, audit and records when ranking fails, then permits retry', async () => {
    const spy = jest.spyOn(app.get(ResultsRankingService),'recalculateInTransaction').mockRejectedValueOnce(new Error('controlled ranking outage'));
    const payload={registrationId:registration,registrationClassId:registrationClass,value:150.123,confirmed:true};
    await request(app.getHttpServer()).post('/results').auth(judgeToken,{type:'bearer'}).send(payload).expect(500);
    expect(await db.result.count({where:{registrationId:registration}})).toBe(0);
    expect(await db.record.count({where:{classId}})).toBe(0);
    expect(await db.auditLog.count({where:{userId:users[1],action:'RESULT_CREATED'}})).toBe(0);
    spy.mockRestore();
    const res=await request(app.getHttpServer()).post('/results').auth(judgeToken,{type:'bearer'}).send(payload).expect(201);
    expect(res.body.place).toBe(1);
    expect(await db.record.count({where:{classId,isCurrent:true}})).toBe(1);
    const replay=await request(app.getHttpServer()).post('/results').auth(judgeToken,{type:'bearer'}).send(payload).expect(201);
    expect(replay.body.id).toBe(res.body.id);
    expect(await db.result.count({where:{registrationId:registration}})).toBe(1);
    await request(app.getHttpServer()).post('/results').auth(judgeToken,{type:'bearer'}).send({...payload,value:151}).expect(409);
  });
  it('keeps unpublished results private and redacts private profiles when published', async () => {
    await request(app.getHttpServer()).get('/results/stage/'+stage).expect(404);
    await db.stage.update({where:{id:stage},data:{resultsPublishedAt:new Date()}});
    const res=await request(app.getHttpServer()).get('/results/stage/'+stage).expect(200);
    expect(JSON.stringify(res.body)).not.toContain('А123АА77');
    expect(JSON.stringify(res.body)).toContain('Участник скрыт');
  });
  it('enforces normalized plate uniqueness even for concurrent API writes', async () => {
    const responses=await Promise.all(['В777ВВ77','B777BB-77'].map(registrationNumber=>request(app.getHttpServer()).post('/participants/'+person+'/cars').auth(adminToken,{type:'bearer'}).send({brand:'Race',model:'Test',registrationCountry:'RU',registrationNumber})));
    expect(responses.map(r=>r.status).sort()).toEqual([201,409]);
    expect(await db.car.count({where:{participantId:person,brand:'Race'}})).toBe(1);
  });
});
