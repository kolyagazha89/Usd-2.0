import {canonicalPlate,duplicatePreview,type DuplicateSnapshot} from './duplicate-profile-preview';
const base=(id:string):DuplicateSnapshot=>({
 id,name:'Иванов Иван',birthDate:'1992-05-16',linkedUserId:null,legacyId:null,usdIdExists:false,teamId:null,
 cars:[],registrations:[],stageInspections:0,disqualifications:0,records:0,claims:0,
});
const registration=(stageId:string,status='ACTIVE')=>({
 id:stageId+'-registration',stageId,status,classes:4,results:2,numbers:2,
});
describe('readonly participant duplicate analysis',()=>{
 it('crosses Russian/Latin plate variants without reassigning car or registration ownership',()=>{
  const source={...base('source'),cars:[{id:'car-a',country:'RU',number:'А123АА72',configurations:3}],
   registrations:[registration('st1')],records:3};
  const target={...base('target'),cars:[{id:'car-b',country:'RU',number:'A123AA72',configurations:2}],
   registrations:[registration('st1')],records:1};
  expect(canonicalPlate('RU','A123AA72')).toBe(canonicalPlate('RU','А123АА72'));
  const preview=duplicatePreview(source,target);
  expect(preview.canMerge).toBe(false);
  expect(preview.state).toBe('DRY_RUN_ONLY');
  expect(preview.conflicts.map(c=>c.code)).toEqual(['SAME_STAGE','DUPLICATE_CARS']);
  expect(preview.counts).toMatchObject({
   source:{cars:1,configurations:3,registrations:1,classes:4,results:2,registrationNumbers:2,records:3},
   target:{cars:1,configurations:2,records:1},
  });
 });
 it('does not block on cancelled registrations or unrelated stages',()=>{
  const preview=duplicatePreview({...base('s'),registrations:[registration('stage-a','CANCELLED')]},{
   ...base('t'),registrations:[registration('stage-a'),registration('stage-b')],
  });
  expect(preview.conflicts).toEqual([]);
  expect(preview.canMerge).toBe(false); // A clean preview never grants permission to mutate.
 });
 it('reports conflicts for two accounts, different teams, different birth dates and immutable IDs',()=>{
  const preview=duplicatePreview({
   ...base('s'),linkedUserId:'u1',teamId:'team1',birthDate:'1990-01-01',usdIdExists:true,legacyId:'old-s',
  },{
   ...base('t'),linkedUserId:'u2',teamId:'team2',birthDate:'1990-01-02',usdIdExists:true,legacyId:'old-t',
  });
  expect(preview.conflicts.map(c=>c.code)).toEqual([
   'TWO_ACCOUNTS','BIRTH_DATE_MISMATCH','DIFFERENT_TEAMS','TWO_USD_IDS','TWO_LEGACY_IDS',
  ]);
 });
 it('cannot use identical source and target IDs',()=>{
  expect(()=>duplicatePreview(base('s'),base('s'))).toThrow();
 });
});

describe('lossless merge preview blockers beyond matching names',()=>{
 it('flags overlapping global participant inspections even if registration was cancelled',()=>{
  const source={...base('s'),stageInspectionStages:['stage-1','stage-2'],stageInspections:2};
  const target={...base('t'),stageInspectionStages:['stage-2'],stageInspections:1};
  const view=duplicatePreview(source,target);
  expect(view.conflicts.map(item=>item.code)).toContain('SHARED_STAGE_INSPECTION');
  expect(view.canMerge).toBe(false);
 });
 it('prevents concurrent pending profile ownership claims from being ignored',()=>{
  const view=duplicatePreview({...base('s'),claims:2},base('t'));
  expect(view.conflicts.map(item=>item.code)).toContain('PENDING_CLAIMS');
  expect(view.counts.source.pendingClaims).toBe(2);
 });
 it('does not invent conflicts for separate stages and no pending ownership requests',()=>{
  const view=duplicatePreview({...base('s'),stageInspectionStages:['stage-a'],stageInspections:1},
   {...base('t'),stageInspectionStages:['stage-b'],stageInspections:1});
  expect(view.conflicts).toEqual([]);
  expect(view.canMerge).toBe(false);
 });
});
