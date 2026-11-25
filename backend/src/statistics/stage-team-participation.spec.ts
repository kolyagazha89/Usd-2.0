import {summarizeStageTeams,type TeamRegistration} from './stage-team-participation';
const row=(id:string,person:string,team:string|null,extra:Partial<TeamRegistration>={}):TeamRegistration=>({id,participantId:person,status:'ACTIVE',source:'WEB',participant:{team},...extra});
const frozen=(id:string,name:string,date='2026-10-01')=>({teamIdAtInspection:id,teamNameAtInspection:name,teamAffiliationCapturedAt:new Date(date)});
describe('registered people per stage team',()=>{
 it('counts people once across cars and classes and excludes cancelled registrations',()=>{
  const result=summarizeStageTeams([row('a','p1',' Team  A '),row('b','p1','Team A'),row('c','p2','team a'),row('d','p3','Team B',{status:'CANCELLED'}),row('e','p4',null)],true);
  expect(result.totalParticipants).toBe(3);
  expect(result.preliminaryParticipants).toBe(3);
  expect(result.teams).toEqual([{key:'name:team a',name:'Team A',participants:2,preliminaryParticipants:2},{key:'unattributed',name:'Без команды',participants:1,preliminaryParticipants:1}]);
 });
 it('prefers the earliest event affiliation across all vehicles and never current team',()=>{
  const result=summarizeStageTeams([row('b','p1','Now',frozen('new','Later','2026-10-02')),row('a','p1','Now',frozen('old','Original')),row('c','p1','Now')],true);
  expect(result.teams).toEqual([{key:'id:old',name:'Original',participants:1,preliminaryParticipants:0}]);
 });
 it('keeps teams with equal names and different IDs separate, groups renamed IDs',()=>{
  const result=summarizeStageTeams([row('a','p1',null,frozen('one','Sound')),row('b','p2',null,frozen('two','Sound')),row('c','p3',null,frozen('one','New name'))],false);
  expect(result.teams.map(t=>[t.key,t.participants])).toEqual([['id:one',2],['id:two',1]]);
 });
 it('distinguishes confirmed absence from unknown history and never uses imported current profiles',()=>{
  const result=summarizeStageTeams([row('a','p1','Modern'),row('b','p2','Modern',{teamAffiliationCapturedAt:new Date()}),row('c','p3','Modern',{source:'IMPORT'})],false);
  expect(result.preliminaryParticipants).toBe(0);
  expect(result.teams.find(t=>t.key==='unknown')?.participants).toBe(2);
  expect(result.teams.find(t=>t.key==='unattributed')?.participants).toBe(1);
  expect(summarizeStageTeams([row('c','p3','Modern',{source:'IMPORT'})],true).teams[0].key).toBe('unknown');
 });
 it('uses approved active membership IDs for provisional totals; pending requests are not memberships',()=>{
  const membership={status:'APPROVED',team:{id:'team',name:'Team',isActive:true}};
  const result=summarizeStageTeams([row('a','p1','Old',{participant:{team:'Old',teamMembership:membership}}),row('b','p2','Old',{participant:{team:'Old',teamMembership:{...membership,status:'PENDING'}}})],true);
  expect(result.teams).toEqual(expect.arrayContaining([expect.objectContaining({key:'id:team',name:'Team',participants:1}),expect.objectContaining({key:'unattributed',participants:1})]));
 });
 it('handles empty stages and legacy empty team markers',()=>{
  expect(summarizeStageTeams([],true)).toEqual({totalParticipants:0,preliminaryParticipants:0,teams:[]});
  expect(summarizeStageTeams([row('a','p1',' нет команды ')],true).teams[0].key).toBe('unattributed');
 });
});
