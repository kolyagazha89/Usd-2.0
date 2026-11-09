import {jest} from '@jest/globals';
import {StatisticsService} from './statistics.service';

const id='00000000-0000-4000-8000-000000000001';
const entry=(id:string,live:string|null,frozen:string|null)=>({
 id,participantId:id,carId:'car-'+id,
 participant:{id,firstName:'Test',lastName:'Athlete',middleName:null,team:live},
 teamNameAtInspection:frozen,
 configurationSnapshot:null,
});

describe('season analytics never rewrite historic affiliations',()=>{
 const db:any={season:{findUnique:jest.fn()},registration:{findMany:jest.fn()}};
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
   entry('d','Team USD','-'),
  ]);
  const data=await service.getSeasonAnalytics(id);
  expect(db.registration.findMany).toHaveBeenCalledWith(expect.objectContaining({
   select:expect.objectContaining({teamNameAtInspection:true}),
  }));
  expect(data.registrations).toEqual({total:4,withTeam:2,withoutTeam:2,withoutTeamPercent:50});
  // Equal-count groups use locale sorting; correctness is independent of order.
  expect(data.teams).toHaveLength(2);
  expect(data.teams).toEqual(expect.arrayContaining([
   {name:'Original Team',registrations:2,participants:2,percent:50},
   {name:'Без команды',registrations:2,participants:2,percent:50},
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
 it('retains no team attribution when old registrations have no captured affiliation',async()=>{
  db.registration.findMany.mockResolvedValue([
   entry('a','Team Today',null),
  ]);
  const data=await service.getSeasonAnalytics(id);
  expect(data.registrations.withTeam).toBe(0);
  expect(data.teams).toEqual([{name:'Без команды',registrations:1,participants:1,percent:100}]);
 });
});
