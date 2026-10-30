// Synthetic, loopback-only TeamsModule server for scripts/team-browser-qa.mjs.
// Build backend first. It deliberately imports no mail, auth or other application modules.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {Test}=require('@nestjs/testing'),{ValidationPipe}=require('@nestjs/common'),{Reflector}=require('@nestjs/core'),{JwtService}=require('@nestjs/jwt');
const {TeamsModule}=require('../dist/teams/teams.module.js'),{PrismaService}=require('../dist/prisma/prisma.service.js'),{JwtAuthGuard}=require('../dist/auth/jwt-auth.guard.js'),{RolesGuard}=require('../dist/auth/roles.guard.js');
const url=new URL(process.env.DATABASE_URL??'');assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/usd_teams_test','Refusing non-synthetic/local database');
const module=await Test.createTestingModule({imports:[TeamsModule]}).compile(),db=module.get(PrismaService);
assert.match((await db.$queryRaw`SHOW server_version`)[0].server_version,/^18\./);
const tag=randomUUID().slice(0,8),actors={};
const jwt=new JwtService({secret:'synthetic-browser-secret-minimum-32-characters',signOptions:{issuer:'usd-2.0-api',audience:'usd-2.0-client'}});
for(const key of ['admin','commander','member']){
 const participant=await db.participant.create({data:{firstName:key==='member'?'Иван':'Проверка',lastName:'Синтетический',city:'Тестовый город',team:'Архив браузера '+tag}});
 const user=await db.user.create({data:{email:key+'-'+tag+'@teams.invalid',passwordHash:'unused-synthetic-browser',role:key==='admin'?'ADMIN':'PARTICIPANT',participantId:participant.id,emailVerifiedAt:new Date()}});
 actors[key]={user:{id:user.id,email:user.email,role:user.role,participantId:participant.id,emailVerifiedAt:user.emailVerifiedAt},participant,accessToken:await jwt.signAsync({sub:user.id,role:user.role})};
}
const app=module.createNestApplication();app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}));app.useGlobalGuards(new JwtAuthGuard(jwt,module.get(Reflector),db),new RolesGuard(module.get(Reflector),db));app.enableCors({origin:'http://127.0.0.1:55441',credentials:true});
await app.listen(55440,'127.0.0.1');
await writeFile(process.env.USD_TEAMS_BROWSER_FIXTURE??'/tmp/usd-teams-browser-fixture.json',JSON.stringify({tag,actors}),{mode:0o600});
console.log('Synthetic TeamsModule browser API ready on loopback port 55440.');
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{void app.close().then(()=>process.exit())});
