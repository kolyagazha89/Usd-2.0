import {jest} from '@jest/globals';
import {PrismaService} from './prisma.service';

describe('USD offline Prisma startup with accumulated stages',()=>{
 const original={mode:process.env.USD_VENUE_LAN_MODE,stage:process.env.VENUE_STAGE_ID};
 const A='c510f672-79f7-44eb-8173-2a8ff94b1c0e';
 const B='d510f672-79f7-44eb-8173-2a8ff94b1c0e';
 afterAll(()=>{
  if(original.mode===undefined)delete process.env.USD_VENUE_LAN_MODE;
  else process.env.USD_VENUE_LAN_MODE=original.mode;
  if(original.stage===undefined)delete process.env.VENUE_STAGE_ID;
  else process.env.VENUE_STAGE_ID=original.stage;
 });
 function mockService({role=false,stage=B,active=B,journals=19}={}){
  const prisma=Object.create(PrismaService.prototype) as PrismaService;
  const queried:string[]=[];
  const findMany=jest.fn(async()=>stage?[{id:stage}]:[]);
  Object.defineProperties(prisma,{
   $connect:{value:jest.fn(async()=>undefined)},
   stage:{value:{findMany}},
   $queryRawUnsafe:{value:jest.fn(async(sql:string)=>{
    queried.push(sql);
    if(sql.includes('pg_roles'))return [{rolsuper:role}];
    if(sql.includes('active_stage'))return active?[{stageId:active}]:[];
    if(sql.includes('pg_trigger'))return [{count:journals}];
    throw new Error('Unexpected SQL on startup');
   })},
  });
  return {prisma,findMany,queried};
 }
 beforeEach(()=>{
  process.env.USD_VENUE_LAN_MODE='true';
  process.env.VENUE_STAGE_ID=B;
 });
 it('starts when earlier stage A and active signed B coexist in same PostgreSQL',async()=>{
  const {prisma,findMany,queried}=mockService();
  await expect(prisma.onModuleInit()).resolves.toBeUndefined();
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
   where:{id:B},select:{id:true},take:1,
  }));
  expect(queried.some(sql=>sql.includes('active_stage'))).toBe(true);
 });
 it('rejects an A-signed API trying to serve B-active database',async()=>{
  const {prisma}=mockService({active:A});
  await expect(prisma.onModuleInit()).rejects.toThrow(/stage|этап|pinned|blocked/i);
 });
 it('rejects absent active selector, missing stage and disabled journal',async()=>{
  for(const setup of [{active:''},{stage:''},{journals:18}]){
   const {prisma}=mockService(setup);
   await expect(prisma.onModuleInit()).rejects.toThrow(/stage|journal|этап|blocked/i);
  }
 });
 it('refuses running offline API as PostgreSQL superuser',async()=>{
  const {prisma}=mockService({role:true});
  await expect(prisma.onModuleInit()).rejects.toThrow(/superuser/i);
 });
 it('keeps public Ubuntu Prisma startup independent from venue selection',async()=>{
  delete process.env.USD_VENUE_LAN_MODE;
  const {prisma,queried,findMany}=mockService();
  await expect(prisma.onModuleInit()).resolves.toBeUndefined();
  expect(queried).toHaveLength(0);
  expect(findMany).not.toHaveBeenCalled();
 });
});
