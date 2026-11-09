import {validateMergeCandidates,type MergeCandidate} from './profile-merge-guards';

const person=(id:string):MergeCandidate=>({
 id,firstName:'Иван',lastName:'Иванов',middleName:null,
 birthDate:new Date('1992-04-05'),phone:null,photoUrl:null,city:null,team:null,
 legacyId:null,usdIdToken:null,isPublic:true,user:null,teamMembership:null,
 legacyEmail:null,pendingClaims:0,
 cars:[],registrations:[],stageInspections:[],
});
const registration=(id:string,stageId:string,status='ACTIVE')=>({id,stageId,status});
describe('ADMIN duplicate merge fail-closed rules',()=>{
 it('permits two distinct profiles without conflicting dependencies',()=>{
  const a={...person('source'),registrations:[registration('reg-source','stage-1')]};
  const b={...person('target'),registrations:[registration('reg-target','stage-2')]};
  expect(validateMergeCandidates(a,b)).toEqual([]);
 });
 it('rejects even cancelled overlapping stages because participation history remains',()=>{
  const a={...person('source'),registrations:[registration('reg-source','same','CANCELLED')]};
  const b={...person('target'),registrations:[registration('reg-target','same')]};
  expect(validateMergeCandidates(a,b).map(x=>x.code)).toContain('STAGE_OVERLAP');
 });
 it('rejects two participant-stage inspections with the same stage',()=>{
  const a={...person('source'),stageInspections:[{id:'a',stageId:'stage-1'}]};
  const b={...person('target'),stageInspections:[{id:'b',stageId:'stage-1'}]};
  expect(validateMergeCandidates(a,b).map(x=>x.code)).toContain('INSPECTION_OVERLAP');
 });
 it('rejects account, team, legacy email and active-claim conflicts',()=>{
  const a={...person('source'),user:{id:'u1'},teamMembership:{id:'m1',teamId:'t1',status:'APPROVED'},
   legacyEmail:'OWNER@EXAMPLE.COM',pendingClaims:1};
  const b={...person('target'),user:{id:'u2'},teamMembership:{id:'m2',teamId:'t2',status:'APPROVED'},
   legacyEmail:'other@example.com'};
  const codes=validateMergeCandidates(a,b).map(x=>x.code);
  for(const code of ['TWO_ACCOUNTS','TWO_MEMBERSHIPS','LEGACY_EMAIL_CONFLICT','PENDING_CLAIM'])
   expect(codes).toContain(code);
 });
 it('rejects source pending team membership even if target has none',()=>{
  const a={...person('source'),teamMembership:{id:'m1',teamId:'t1',status:'PENDING'}};
  expect(validateMergeCandidates(a,person('target')).map(x=>x.code)).toContain('UNAPPROVED_MEMBERSHIP');
 });
 it('rejects conflicting public identity and immutable identifiers',()=>{
  const a={...person('source'),firstName:'Иван',phone:'+79990000000',photoUrl:'/a',legacyId:'archive-a',usdIdToken:'first'};
  const b={...person('target'),firstName:'Пётр',phone:'+79991111111',photoUrl:'/b',legacyId:'archive-b',usdIdToken:'second'};
  const codes=validateMergeCandidates(a,b).map(x=>x.code);
  for(const code of ['NAME_MISMATCH','PHONE_MISMATCH','PHOTO_MISMATCH','TWO_LEGACY_IDS','TWO_USD_IDS'])
   expect(codes).toContain(code);
 });
 it('rejects equal Cyrillic/Latin RU plates and conflicting stage-free registrations',()=>{
  const a={...person('source'),cars:[{id:'car1',registrationCountry:'RU',registrationNumber:'А123АА72'}]};
  const b={...person('target'),cars:[{id:'car2',registrationCountry:'RU',registrationNumber:'A123AA72'}]};
  expect(validateMergeCandidates(a,b).map(x=>x.code)).toContain('DUPLICATE_CARS');
 });
 it('never treats identical IDs as a merge',()=>{
  expect(()=>validateMergeCandidates(person('same'),person('same'))).toThrow();
 });
});
