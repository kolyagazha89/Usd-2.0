import {compareSeasons,summarizeSeason,type SeasonSummaryInput} from './season-summary';

const season={id:'season-2026',name:'2026',year:2026};
const stage=(id:string,n:number)=>({id,seasonId:season.id,stageNumber:n,name:'Этап '+n,status:'COMPLETED',date:new Date('2026-05-01')});
const choice=(id:string,dir:string,name:string,numberId:string,place:number|null)=>({
 id,classId:id,numberId,class:{id,name,sortOrder:1,direction:{id:dir,name:dir,sortOrder:dir==='SPL'?1:2}},
 results:place===null?[]:[{id:'result-'+id+'-'+numberId,place}],
});
const input=(registrations:SeasonSummaryInput['registrations']):SeasonSummaryInput=>({
 season,stages:[stage('st1',1),stage('st2',2)],registrations,records:[
  {id:'rec-spl',seasonId:season.id,class:{direction:{name:'SPL'}}},
  {id:'rec-race',seasonId:season.id,class:{direction:{name:'BassRace'}}},
 ],
});
const registration=(id:string,participantId:string,stageId:string,classes:ReturnType<typeof choice>[],status='ACTIVE'):SeasonSummaryInput['registrations'][number]=>({
 id,participantId,stageId,status,participantNumber:2,teamNameAtInspection:null,participant:{createdAt:new Date('2024-01-01'),city:'Тюмень',team:'Team USD'},classes,
});

describe('season reporting uniqueness and actual-result semantics',()=>{
 it('counts athletes once across classes and extra BassRace numbers',()=>{
  const report=summarizeSeason(input([
   registration('r1','p1','st1',[choice('spl','SPL','Limited 2.0','num2',1),choice('race1','BassRace','129.9','num3',2),choice('race2','BassRace','139.9','num4',3)]),
   registration('r2','p1','st2',[choice('spl','SPL','Limited 2.0','num5',null)]),
   registration('r3','p2','st1',[choice('spl','SPL','Limited 2.0','num6',1)]),
   registration('cancel','p3','st1',[choice('spl','SPL','Limited 2.0','num7',1)],'CANCELLED'),
  ]));
  expect(report.totals).toMatchObject({stages:2,registered:2,registrations:3,classEntries:5,actualParticipants:2,results:4,podiums:4,records:1,teams:0});
  expect(report.directions.find(d=>d.name==='BassRace')).toMatchObject({athletes:1,classEntries:2,results:2});
  expect(report.stages).toEqual([
   {id:'st1',name:'Этап 1',stageNumber:1,registered:2,actual:2},
   {id:'st2',name:'Этап 2',stageNumber:2,registered:1,actual:0},
  ]);
 });
 it('does not mistake registrations without results for actual participation',()=>{
  const report=summarizeSeason(input([registration('r1','p1','st1',[choice('spl','SPL','Limited 2.0','num2',null)])]));
  expect(report.totals.registered).toBe(1);
  expect(report.totals.actualParticipants).toBe(0);
 });
 it('counts only inspection-frozen team names, never current roster names',()=>{
  const withoutSnapshot=registration('r1','p1','st1',[choice('spl','SPL','Limited 2.0','num2',1)]);
  const withSnapshot={...registration('r2','p2','st1',[choice('spl','SPL','Limited 2.0','num3',1)]),
   teamNameAtInspection:'Историческая команда'};
  const oldMembership={...registration('r3','p3','st2',[choice('spl','SPL','Limited 2.0','num4',1)]),
   teamNameAtInspection:'ИСТОРИЧЕСКАЯ КОМАНДА'};
  const report=summarizeSeason(input([withoutSnapshot,withSnapshot,oldMembership]));
  expect(report.totals.teams).toBe(1);
 });
 it('identifies a historical team by its frozen ID despite renamed snapshots',()=>{
  const first={...registration('r1','p1','st1',[choice('spl','SPL','Limited 2.0','num2',1)]),
   teamIdAtInspection:'team-stable',teamNameAtInspection:'Team Old'};
  const renamed={...registration('r2','p2','st2',[choice('spl','SPL','Limited 2.0','num3',1)]),
   teamIdAtInspection:'team-stable',teamNameAtInspection:'Team New'};
  expect(summarizeSeason(input([first,renamed])).totals.teams).toBe(1);
 });
 it('does not merge two distinct inspected teams because they share a display name',()=>{
  const first={...registration('r1','p1','st1',[choice('spl','SPL','Limited 2.0','num2',1)]),
   teamIdAtInspection:'team-one',teamNameAtInspection:'Team Sound'};
  const second={...registration('r2','p2','st2',[choice('spl','SPL','Limited 2.0','num3',1)]),
   teamIdAtInspection:'team-two',teamNameAtInspection:'Team Sound'};
  expect(summarizeSeason(input([first,second])).totals.teams).toBe(2);
 });
 it('never divides by zero on empty baseline',()=>{
  const baseline=summarizeSeason(input([]));
  const current=summarizeSeason(input([registration('r1','p1','st1',[choice('spl','SPL','Limited 2.0','num2',1)])]));
  expect(compareSeasons(baseline,current).changes.registered).toEqual({difference:1,percent:null});
 });
});
