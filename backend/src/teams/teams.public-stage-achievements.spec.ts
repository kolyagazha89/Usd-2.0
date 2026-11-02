import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { TeamsService } from './teams.service';

const published = (id:string,stageId:string,place:number|null=1) => ({
 id,place,value:{toString:()=> '151.250'},unit:'DB',
 registration:{
  participant:{id:'participant-1',firstName:'Иван',lastName:'Иванов'},
  stage:{id:stageId,name:'Этап '+stageId,city:'Тюмень',date:new Date('2026-07-12T12:00:00Z')},
 },
 registrationClass:{class:{id:'class-1',name:'SPL Limited 2.0',direction:{name:'SPL'}}},
});

describe('published team-stage performances',()=>{
 const db:any={
  team:{findUnique:jest.fn()},
  result:{findMany:jest.fn()},
 };
 const service=new TeamsService(db);
 beforeEach(()=>{
  jest.clearAllMocks();
  db.team.findUnique.mockResolvedValue({
   id:'team-1',name:'Team USD',
   memberships:[{participantId:'participant-1'}],
  });
  db.result.findMany.mockResolvedValue([published('r1','stage-1',1),published('r2','stage-1',2),published('r3','stage-2',null)]);
 });

 it('exposes only results belonging to approved public members on published stages',async()=>{
  const result=await service.publicStageAchievements('team-1');
  expect(db.team.findUnique).toHaveBeenCalledWith(expect.objectContaining({
   where:{id:'team-1'},
   select:expect.objectContaining({
    memberships:expect.objectContaining({
     where:{status:'APPROVED',participant:{isPublic:true}},
    }),
   }),
  }));
  expect(db.result.findMany).toHaveBeenCalledWith(expect.objectContaining({
   where:{registration:expect.objectContaining({
    participantId:{in:['participant-1']},status:'ACTIVE',
    participant:{isPublic:true},
    stage:{isDeleted:false,status:{in:['PUBLISHED','COMPLETED']},resultsPublishedAt:{not:null}},
   })},
   take:501,
  }));
  expect(result).toMatchObject({scope:'CURRENT_PUBLIC_MEMBERS',total:3,truncated:false});
  expect(result.stages).toHaveLength(2);
  expect(result.stages[0].performances).toHaveLength(2);
  expect(result.stages[0].performances[0]).toMatchObject({id:'r1',value:'151.250',unit:'DB',place:1});
 });

 it('returns no private roster details and avoids querying results without public members',async()=>{
  db.team.findUnique.mockResolvedValue({id:'team-1',name:'Team USD',memberships:[]});
  await expect(service.publicStageAchievements('team-1')).resolves.toMatchObject({
   total:0,scope:'CURRENT_PUBLIC_MEMBERS',stages:[],
  });
  expect(db.result.findMany).not.toHaveBeenCalled();
 });

 it('rejects unknown team identifiers',async()=>{
  db.team.findUnique.mockResolvedValue(null);
  await expect(service.publicStageAchievements('not-a-team')).rejects.toBeInstanceOf(NotFoundException);
  expect(db.result.findMany).not.toHaveBeenCalled();
 });

 it('signals truncation instead of silently claiming a complete archive',async()=>{
  db.result.findMany.mockResolvedValue(Array.from({length:501},(_,i)=>published('r'+i,'stage-1')));
  const data=await service.publicStageAchievements('team-1');
  expect(data.total).toBe(500);
  expect(data.truncated).toBe(true);
  expect(data.stages[0].performances).toHaveLength(500);
 });
});
