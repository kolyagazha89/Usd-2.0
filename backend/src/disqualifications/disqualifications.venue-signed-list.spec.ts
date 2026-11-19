import {DisqualificationsService} from './disqualifications.service';
import {ServiceUnavailableException} from '@nestjs/common';

const stageId='c510f672-79f7-44eb-8173-2a8ff94b1c0e';
const seasonId='d510f672-79f7-44eb-8173-2a8ff94b1c0e';
const participantId='e510f672-79f7-44eb-8173-2a8ff94b1c0e';
const banId='a510f672-79f7-44eb-8173-2a8ff94b1c0e';
const record={id:banId,participantId,scope:'FORMAT',stageId:null,seasonId:null};
const make=(records:unknown)=>({
 stage:{findUnique:async()=>({id:stageId,seasonId,name:'Тестовый этап',stageNumber:1,city:'Тюмень'})},
 participant:{findMany:async()=>[{id:participantId,firstName:'Анна',lastName:'Тестовая',middleName:null,team:null}]},
 siteSettings:{findUnique:async()=>({registration:{
  venueDisqualificationSnapshot:{stageId,generatedAt:new Date().toISOString(),records},
 }})},
 disqualification:{findMany:async()=>{throw new Error('Unsafe local-only disciplinary query');}},
});
describe('LAN admin read-only disciplinary list',()=>{
 const original=process.env.USD_VENUE_LAN_MODE,priorStage=process.env.VENUE_STAGE_ID;
 beforeAll(()=>{process.env.USD_VENUE_LAN_MODE='true';process.env.VENUE_STAGE_ID=stageId;});
 afterAll(()=>{
  if(original===undefined)delete process.env.USD_VENUE_LAN_MODE;
  else process.env.USD_VENUE_LAN_MODE=original;
  if(priorStage===undefined)delete process.env.VENUE_STAGE_ID;
  else process.env.VENUE_STAGE_ID=priorStage;
 });
 it('shows a signed central FORMAT ban instead of misleading empty local database',async()=>{
  const service=new DisqualificationsService(make([record]) as any,{} as any);
  const rows=await service.findAll({status:'ACTIVE'});
  expect(rows).toMatchObject([{id:banId,participantId,scope:'FORMAT',
   status:'ACTIVE',participant:{firstName:'Анна',lastName:'Тестовая'}}]);
  expect(await service.findAll({status:'REVOKED'})).toEqual([]);
 });
 it('refuses to present missing or corrupted signed eligibility as an empty list',async()=>{
  const service=new DisqualificationsService(make(undefined) as any,{} as any);
  await expect(service.findAll()).rejects.toThrow(ServiceUnavailableException);
 });
});
