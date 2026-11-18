import 'reflect-metadata';
import {jest} from '@jest/globals';
import {validateSync} from 'class-validator';
import {CreateStageDto,UpdateStageDto} from './dto/stage.dto';
import {StagesService} from './stages.service';

const req:any={user:{sub:'admin',role:'ADMIN'},ip:'127.0.0.1'};
const draft={stageNumber:11,name:'USD Winter Cup',city:'Краснодар',date:'2026-11-28T12:00:00',status:'DRAFT',seasonId:'season-1'};

describe('Moscow stage start time',()=>{
 it('accepts HH:mm, applies 10:00 default, and rejects malformed hour or minute',()=>{
  const creation=Object.assign(new CreateStageDto(),draft,{startTimeMsk:'10:00'});
  expect(validateSync(creation)).toEqual([]);
  const missingTime=Object.assign(new CreateStageDto(),draft);
  expect(validateSync(missingTime)).toEqual([]);
  for(const time of ['25:00','10:60','7:00','10:00Z']){
   const update=Object.assign(new UpdateStageDto(),{startTimeMsk:time});
   expect(validateSync(update).map(e=>e.property)).toContain('startTimeMsk');
  }
  expect(validateSync(Object.assign(new UpdateStageDto(),{startTimeMsk:'14:30'}))).toEqual([]);
 });

 it('creates a stage with default 10:00 without modifying its calendar date',async()=>{
  const prisma:any={
   season:{findUnique:jest.fn().mockResolvedValue({id:'season-1',year:2026,status:'ACTIVE'})},
   stage:{findUnique:jest.fn().mockResolvedValue(null),create:jest.fn().mockImplementation(async({data}:any)=>({id:'stage-11',...data}))},
  };
  const audit:any={log:jest.fn()};
  const svc=new StagesService(prisma,audit);
  await svc.create(draft as any,req);
  const data=prisma.stage.create.mock.calls[0][0].data;
  expect(data.startTimeMsk).toBe('10:00');
  expect(data.date.toISOString()).toBe('2026-11-28T12:00:00.000Z');
 });

 it('editing start time only does not rewrite date or registration windows',async()=>{
  const stage={id:'stage-11',seasonId:'season-1',stageNumber:11,status:'PUBLISHED',
   name:'USD Winter Cup',city:'Краснодар',date:new Date('2026-11-28T12:00:00Z'),
   startTimeMsk:'10:00',registrationOpen:true,registrationStartsAt:null,registrationEndsAt:null,
   rulesSnapshot:{revisionId:'r1'},venue:'FRESH',address:null};
  const prisma:any={
   season:{findUnique:jest.fn().mockResolvedValue({id:'season-1',status:'ACTIVE'})},
   stage:{findFirst:jest.fn().mockResolvedValue(stage),update:jest.fn().mockImplementation(async({data}:any)=>({...stage,...data}))},
  };
  const audit:any={log:jest.fn()};
  const svc=new StagesService(prisma,audit);
  await svc.update(stage.id,{startTimeMsk:'11:30'} as any,req);
  const data=prisma.stage.update.mock.calls[0][0].data;
  expect(data.startTimeMsk).toBe('11:30');
  expect(data).not.toHaveProperty('date');
  expect(data).not.toHaveProperty('registrationStartsAt');
  expect(data).not.toHaveProperty('registrationEndsAt');
 });
});
