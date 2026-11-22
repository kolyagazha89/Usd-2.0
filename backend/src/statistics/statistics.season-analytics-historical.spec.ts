import {jest} from '@jest/globals';
import {StatisticsService} from './statistics.service';

const id='00000000-0000-4000-8000-000000000001';
const entry=(id:string,live:string|null,frozen:string|null)=>({
 id,stageId:'stage-1',source:'PRE_REGISTRATION',participantId:id,
 participant:{id,firstName:'Test',lastName:'Athlete',middleName:null,team:live},
 teamNameAtInspection:frozen,
 configurationSnapshot:null,
});

describe('season analytics never rewrite historic affiliations',()=>{
 const db:any={season:{findUnique:jest.fn()},registration:{findMany:jest.fn()},importRow:{findMany:jest.fn()}};
 const service=new StatisticsService(db);
 beforeEach(()=>{
  jest.clearAllMocks();
  db.season.findUnique.mockResolvedValue({id,name:'2026',year:2026,status:'ACTIVE'});
 });
 it('counts only inspection-frozen teams and does not use a newly joined live roster',async()=>{
  db.registration.findMany.mockResolvedValue([
   entry('a','CURRENT TEAM','Original Team'),
   entry('b','Current Team',' original team '),
   entry('c','NEW TEAM',null),
   {...entry('d','Team USD',null),teamAffiliationCapturedAt:new Date('2026-01-01')},
  ]);
  const data=await service.getSeasonAnalytics(id);
  expect(db.registration.findMany).toHaveBeenCalledWith(expect.objectContaining({
   select:expect.objectContaining({teamNameAtInspection:true}),
  }));
  expect(data.registrations).toEqual({total:4,withTeam:2,withoutTeam:1,withoutTeamPercent:25,unknownTeam:1,unknownTeamPercent:25,fromArchive:0});
  // Equal-count groups use locale sorting; correctness is independent of order.
  expect(data.teams).toHaveLength(3);
  expect(data.teams).toEqual(expect.arrayContaining([
   expect.objectContaining({key:'snapshot:original team',name:'Original Team',registrations:2,participants:2,percent:50}),
   expect.objectContaining({key:'unattributed',name:'Без команды',registrations:1,participants:1,percent:25}),
   expect.objectContaining({key:'unknown',name:'Нет данных о команде',registrations:1,participants:1,percent:25}),
  ]));
 });
 it('uses frozen team IDs when a renamed team spans multiple stages',async()=>{
  db.registration.findMany.mockResolvedValue([
   {...entry('a','Modern Team','Old Label'),teamIdAtInspection:'team-stable'},
   {...entry('b','Modern Team','New Label'),teamIdAtInspection:'team-stable'},
  ]);
  const data=await service.getSeasonAnalytics(id);
  expect(db.registration.findMany).toHaveBeenCalledWith(expect.objectContaining({
   select:expect.objectContaining({teamIdAtInspection:true}),
  }));
  expect(data.registrations.withTeam).toBe(2);
  expect(data.teams).toHaveLength(1);
  expect(data.teams[0]).toMatchObject({registrations:2,participants:2,percent:100});
 });
 it('keeps two frozen teams distinct even when their display names are equal',async()=>{
  db.registration.findMany.mockResolvedValue([
   {...entry('a','Today','Sound Team'),teamIdAtInspection:'team-one'},
   {...entry('b','Today','Sound Team'),teamIdAtInspection:'team-two'},
  ]);
  const data=await service.getSeasonAnalytics(id);
  expect(data.teams).toHaveLength(2);
  expect(data.teams.map(team=>team.registrations)).toEqual([1,1]);
  expect(data.teams.map(team=>team.key).sort()).toEqual(['id:team-one','id:team-two']);
 });
 it('computes sponsor brands only from speaker/amplifier snapshots and counts distinct registrations',async()=>{
  db.registration.findMany.mockResolvedValue([
   {...entry('a',null,null),configurationSnapshot:{
    audioComponents:[{brand:'Russian Bass'},{brand:'Рашн Басс'},{brand:'Apocalypce'}],
    amplifiers:[{brand:'DEAF-BONCE'}],batteries:[{brand:'Battery'}],generators:[{brand:'Generator'}],
    headUnits:[{brand:'Head Unit'}],
   }},
   {...entry('b',null,null),configurationSnapshot:{
    audioComponents:[{brand:'russianbass'}],amplifiers:[{brand:'Deaf Bonce'}],
   }},
   {...entry('c',null,null),configurationSnapshot:null},
  ]);
  const data=await service.getSeasonAnalytics(id);
  expect(data.speakerBrands).toEqual([
   {brand:'Russian Bass',count:2,percent:66.7},
   {brand:'Deaf Bonce',count:1,percent:33.3},
  ]);
  expect(data.amplifierBrands).toEqual([{brand:'Deaf Bonce',count:2,percent:66.7}]);
  expect(data.configurationBrands).toEqual([
   {brand:'Deaf Bonce',count:2,percent:66.7},
   {brand:'Russian Bass',count:2,percent:66.7},
  ]);
  expect(JSON.stringify(data.configurationBrands)).not.toMatch(/Battery|Generator|Head Unit/);
 });
 it('retains no team attribution when old registrations have no captured affiliation',async()=>{
  db.registration.findMany.mockResolvedValue([
   entry('a','Team Today',null),
  ]);
  const data=await service.getSeasonAnalytics(id);
  expect(data.registrations.withTeam).toBe(0);
  expect(data.teams).toEqual([{key:'unknown',name:'Нет данных о команде',registrations:1,participants:1,percent:100}]);
  expect(db.importRow.findMany).not.toHaveBeenCalled();
 });
 it('recovers unanimous archive teams without using current rosters or inflating registration counts',async()=>{
  const imported = (id:string) => ({...entry(id,'Today',null),source:'IMPORT'});
  const result = (registrationId:string,historicalTeam:unknown,stageId='stage-1')=>({
   registrationId,normalizedData:{historicalTeam},importJob:{stageId},
  });
  db.registration.findMany.mockResolvedValue([
   imported('archive'),imported('conflict'),imported('wrong-stage'),imported('missing'),
   {...imported('frozen'),teamNameAtInspection:'Frozen team'},
   {...imported('captured-none'),teamAffiliationCapturedAt:new Date('2026-01-01')},
   entry('live','Current team',null),
  ]);
  db.importRow.findMany.mockResolvedValue([
   result('archive','Archive  team'),result('archive','archive team'),result('archive',null),
   result('conflict','First'),result('conflict','Second'),
   result('wrong-stage','Different stage','stage-2'),result('missing','—'),
   result('captured-none','Stale team'),result('live','Fake history'),
  ]);
  const data=await service.getSeasonAnalytics(id);
  expect(db.importRow.findMany).toHaveBeenCalledWith(expect.objectContaining({
   where:{
    registrationId:{in:['archive','conflict','wrong-stage','missing']},
    type:'RESULT',status:'COMMITTED',
    importJob:{status:'COMMITTED',metadata:{path:['historicalResults'],equals:true}},
   },
  }));
  expect(data.registrations).toMatchObject({total:7,withTeam:2,withoutTeam:1,unknownTeam:4,fromArchive:1});
  expect(data.teams).toEqual(expect.arrayContaining([
   expect.objectContaining({key:'snapshot:archive team',registrations:1,participants:1}),
   expect.objectContaining({key:'snapshot:frozen team',registrations:1}),
   expect.objectContaining({key:'unknown',registrations:4}),
  ]));
 });

});
