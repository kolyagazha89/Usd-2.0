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
 it('does not block on cancelled registrations without results or unrelated stages',()=>{
  const preview=duplicatePreview({...base('s'),registrations:[{...registration('stage-a','CANCELLED'),results:0}]},{
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

 it('blocks overlapping archived result history instead of treating a cancelled registration as no conflict',()=>{
  const source={...base('source'),registrations:[registration('stage-old','CANCELLED')]};
  const target={...base('target'),registrations:[registration('stage-old','ACTIVE')]};
  const preview=duplicatePreview(source,target);
  expect(preview.conflicts.map(item=>item.code)).toContain('HISTORICAL_STAGE_OVERLAP');
  expect(preview.canMerge).toBe(false);
 });
 it('counts retained media and immutable configuration versions in the read-only comparison',()=>{
  const preview=duplicatePreview({
   ...base('source'),profilePhoto:true,mediaUploads:3,
   cars:[{id:'car1',country:'RU',number:'А001АА72',configurations:2,configurationVersions:6,hasPhoto:true}],
   registrations:[{...registration('stage1'),historicalTeamSnapshot:true}],
  },{
   ...base('target'),mediaUploads:0,
  });
  expect(preview.counts.source).toMatchObject({
   profilePhotos:1,carPhotos:1,mediaUploads:3,configurationVersions:6,teamSnapshots:1,
  });
  expect(preview.counts.target).toMatchObject({profilePhotos:0,carPhotos:0,mediaUploads:0,configurationVersions:0,teamSnapshots:0});
 });
 it('cannot use identical source and target IDs',()=>{
  expect(()=>duplicatePreview(base('s'),base('s'))).toThrow();
 });
});
