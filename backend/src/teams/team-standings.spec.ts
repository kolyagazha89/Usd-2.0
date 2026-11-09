import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { groupPublishedTeamPerformances } from './team-standings';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const SEASON = '00000000-0000-4000-8000-0000000000c1';
const STAGE = '00000000-0000-4000-8000-0000000000d1';
const participant = (id:string)=>({id,firstName:'Имя',lastName:'Участник'});
const performance=(id:string,teamId:string|null,place:number|null,unit='DB',pid='p1')=>({
 id,place,value:{toString:()=>unit==='MPS'?'28.500':'155.200'},unit,
 registration:{
  teamIdAtInspection:teamId,teamNameAtInspection:teamId===A?'Team Alpha':'Team Beta',
  participant:participant(pid),
  stage:{id:STAGE,name:'Первый этап',city:'Тюмень',date:new Date('2026-07-12T12:00:00Z'),seasonId:SEASON},
 },
 registrationClass:{class:{id:'class1',name:unit==='MPS'?'BDW':'SPL',direction:{name:unit==='MPS'?'BDW SPL':'SPL'}}},
});

describe('team standings without fabricated points',()=>{
 it('groups only frozen team IDs, preserves original units and classes, and counts unique athletes',()=>{
  const result=groupPublishedTeamPerformances([
   performance('r1',A,1,'DB','p1'),
   performance('r2',A,3,'MPS','p1'),
   performance('r3',B,1,'DB','p2'),
   performance('r4',B,1,'DB','p3'),
   performance('legacy',null,1,'DB','p4'),
  ],new Map([[A,'Team Alpha'],[B,'Team Beta']]));
  expect(result).toHaveLength(2);
  expect(result.map(x=>x.teamId)).toEqual([B,A]); // more confirmed 1st places first
  expect(result[0]).toMatchObject({performances:2,firstPlaces:2,podiums:2,participants:2});
  expect(result[1]).toMatchObject({performances:2,firstPlaces:1,podiums:2,participants:1});
  expect(result[1].results[1]).toMatchObject({id:'r2',unit:'MPS',value:'28.500',direction:'BDW SPL',classId:'class1'});
  expect(Object.keys(result[0])).not.toContain('points');
  expect(Object.keys(result[0])).not.toContain('place');
 });
 it('resolves historical team ID to current team name, never to current participant.team',()=>{
  const data=groupPublishedTeamPerformances([performance('r1',A,2)],new Map([[A,'Renamed Team']]));
  expect(data).toHaveLength(1);
  expect(data[0].name).toBe('Renamed Team');
  expect(data[0].results[0].stage.id).toBe(STAGE);
 });
});

describe('TeamsService.publicStandings scope and data protection',()=>{
 const db:any={result:{findMany:jest.fn()},team:{findMany:jest.fn()}};
 const service=new TeamsService(db);
 beforeEach(()=>{jest.clearAllMocks();db.result.findMany.mockResolvedValue([performance('r1',A,1),performance('r2',B,3)]);
  db.team.findMany.mockResolvedValue([{id:A,name:'Team Alpha'},{id:B,name:'Team Beta'}]);});
 it('rejects unbounded queries and malformed IDs before accessing the database',async()=>{
  await expect(service.publicStandings({})).rejects.toBeInstanceOf(BadRequestException);
  await expect(service.publicStandings({seasonId:SEASON,stageId:STAGE})).rejects.toBeInstanceOf(BadRequestException);
  await expect(service.publicStandings({stageId:'not-a-uuid'})).rejects.toBeInstanceOf(BadRequestException);
  expect(db.result.findMany).not.toHaveBeenCalled();
 });
 it('filters to published stages, active registrations, public participants and inspection-frozen team',async()=>{
  const data=await service.publicStandings({seasonId:SEASON});
  expect(db.result.findMany).toHaveBeenCalledWith(expect.objectContaining({
   where:{registration:expect.objectContaining({
    teamIdAtInspection:{not:null},
    teamAffiliationCapturedAt:{not:null},
    participant:{isPublic:true},
    status:'ACTIVE',
    stage:expect.objectContaining({seasonId:SEASON,isDeleted:false,resultsPublishedAt:{not:null},status:{in:['PUBLISHED','COMPLETED']}}),
   })},
   take:1501,
  }));
  expect(db.team.findMany).toHaveBeenCalledWith({where:{id:{in:[A,B]}},select:{id:true,name:true}});
  expect(data).toMatchObject({scope:{type:'SEASON',id:SEASON},truncated:false,teams:[{teamId:A},{teamId:B}]});
 });
 it('limits the published team summary to a selected direction',async()=>{
  const data=await service.publicStandings({seasonId:SEASON,direction:'BFSPL'});
  expect(db.result.findMany).toHaveBeenCalledWith(expect.objectContaining({
   where:expect.objectContaining({
    registrationClass:{class:{direction:{name:'BFSPL'}}},
    registration:expect.objectContaining({participant:{isPublic:true},teamIdAtInspection:{not:null}}),
   }),
   take:1501,
  }));
  expect(data).toMatchObject({direction:'BFSPL',scope:{type:'SEASON',id:SEASON}});
 });
 it('rejects malicious or empty direction filters before querying the database',async()=>{
  await expect(service.publicStandings({stageId:STAGE,direction:' '.repeat(101)})).rejects.toBeInstanceOf(BadRequestException);
  await expect(service.publicStandings({stageId:STAGE,direction:' '})).rejects.toBeInstanceOf(BadRequestException);
  expect(db.result.findMany).not.toHaveBeenCalled();
 });
 it('filters a single stage, retains primary protocol IDs, signals partial result if bounded',async()=>{
  db.result.findMany.mockResolvedValue(Array.from({length:1501},(_,i)=>performance('r'+i,A,i%3+1)));
  const data=await service.publicStandings({stageId:STAGE});
  expect(db.result.findMany).toHaveBeenCalledWith(expect.objectContaining({
   where:{registration:expect.objectContaining({stage:expect.objectContaining({id:STAGE})})},
   take:1501,
  }));
  expect(data.truncated).toBe(true);
  expect(data.total).toBe(1500);
  expect(data.teams[0].results).toHaveLength(1500);
  expect(data.teams[0].results[0]).toMatchObject({id:'r0',stage:{id:STAGE}});
 });
});
