import { jest } from '@jest/globals';
import { StatisticsService } from './statistics.service';

describe('StatisticsService dashboard stage selection', () => {
  it('shows the nearest upcoming stage when no stage is scheduled for today', async () => {
    const nearestStage = {
      id: 'nearest-stage',
      stageNumber: 4,
      name: 'Следующий этап',
      city: 'Тюмень',
      date: new Date(Date.now() + 24 * 60 * 60 * 1000),
      registrationOpen: false,
      status: 'PUBLISHED',
      season: { id: 'season-1', name: 'Сезон', year: 2026 },
    };
    const prisma: any = {
      stage: {
        findFirst: jest.fn().mockResolvedValue(nearestStage),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      registration: { findMany: jest.fn().mockResolvedValue([]) },
      participantStageInspection: { count: jest.fn().mockResolvedValue(0) },
      result: { count: jest.fn().mockResolvedValue(0) },
      disqualification: { count: jest.fn().mockResolvedValue(0) },
      importJob: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = new StatisticsService(prisma);
    jest.spyOn(service, 'getOverview').mockResolvedValue({
      stats: {
        participants: 0,
        cars: 0,
        seasons: 0,
        stages: 0,
        activeRegistrations: 0,
        appearances: 0,
        currentRecords: 0,
      },
      topParticipants: [],
    } as any);

    const dashboard = await service.getDashboard();

    expect(dashboard.currentStage).toEqual(nearestStage);
    const stageQuery = prisma.stage.findFirst.mock.calls[0][0];
    expect(stageQuery.where.date.gte).toBeInstanceOf(Date);
    expect(stageQuery.where.date).not.toHaveProperty('lt');
  });
});


describe('StatisticsService stage reporting with active registration inspections', () => {
 it('combines the current vehicle inspection and legacy shared inspection, without losing pending equipment', async () => {
  const stage={id:'s1',stageNumber:1,name:'Этап',city:'Тюмень',date:new Date('2026-10-01'),status:'COMPLETED',resultsPublishedAt:new Date('2026-10-02'),season:{id:'2026',name:'Сезон',year:2026}};
  const participant={firstName:'Иван',lastName:'Иванов',middleName:null,team:null};
  const car={brand:'ВАЗ',model:'2107',registrationNumber:'A001AA'};
  const regs=[
   {id:'r1',participantId:'p1',carId:'car1',participantNumber:2,configurationSnapshot:{configurationPending:true},participant,car,classes:[],inspection:null,stageInspection:{status:'PASSED',notes:null}},
   {id:'r2',participantId:'p2',carId:'car2',participantNumber:3,configurationSnapshot:{configurationPending:true,postStageCompletion:{versionId:'v1'}},participant,car,classes:[],inspection:{status:'FAILED',notes:'Неверное крепление'},stageInspection:null},
   {id:'r3',participantId:'p3',carId:'car3',participantNumber:4,configurationSnapshot:{configurationPending:false},participant,car,classes:[],inspection:null,stageInspection:null},
  ];
  const prisma:any={
   stage:{findUnique:jest.fn().mockResolvedValue(stage)},
   registration:{findMany:jest.fn().mockResolvedValue(regs)},
   result:{findMany:jest.fn().mockResolvedValue([])},
   disqualification:{findMany:jest.fn().mockResolvedValue([])},
  };
  const service=new StatisticsService(prisma);
  const report=await service.getStage('s1');
  expect(report.stage.resultsPublishedAt).toEqual(stage.resultsPublishedAt);
  expect(report.stats.inspections).toMatchObject({total:2,passed:1,failed:1,pending:1});
  expect(report.stats.pendingRegistrations.map(row=>row.registrationId)).toEqual(['r3']);
  expect(report.stats.pendingConfigurations.map(row=>row.registrationId)).toEqual(['r1']);
  expect(report.stats.inspectionDetails.map(row=>row.status)).toEqual(['PASSED','FAILED']);
  expect(prisma.inspection).toBeUndefined();
  expect(prisma.registration.findMany).toHaveBeenCalledWith(expect.objectContaining({
   where:{stageId:'s1',status:'ACTIVE'},
   select:expect.objectContaining({stageInspection:{select:{status:true,notes:true}},configurationSnapshot:true}),
  }));
 });
});

describe('StatisticsService stage team enrolment',()=>{
 const stage={id:'stage',stageNumber:1,name:'Stage',date:new Date('2099-01-01'),status:'PUBLISHED',resultsPublishedAt:null};
 const person={firstName:'Test',lastName:'Athlete',middleName:null,team:'Team A'};
 const registration=(id:string,participantId:string)=>({id,participantId,status:'ACTIVE',source:'WEB',carId:id,participantNumber:1,configurationSnapshot:{},participant:person,car:{brand:'Lada',model:'Vesta',isActive:true},classes:[],inspection:null,stageInspection:null});
 const setup=(stageValue:any=stage,publishedBefore=false)=>{
  const prisma:any={stage:{findUnique:jest.fn().mockResolvedValue(stageValue)},registration:{findMany:jest.fn().mockResolvedValue([registration('one','p1'),registration('two','p1'),registration('three','p2')])},result:{findMany:jest.fn().mockResolvedValue([])},disqualification:{findMany:jest.fn().mockResolvedValue([])},auditLog:{findFirst:jest.fn().mockResolvedValue(publishedBefore?{id:'publication'}:null)}};
  return {prisma,service:new StatisticsService(prisma)};
 };
 it('returns unique registered team people before any inspections or podiums',async()=>{
  const {service,prisma}=setup();const result=await service.getStage('stage');
  expect(result.stats.teamParticipation).toEqual({totalParticipants:2,preliminaryParticipants:2,teams:[{key:'name:team a',name:'Team A',participants:2,preliminaryParticipants:2}]});
  expect(prisma.registration.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{stageId:'stage',status:'ACTIVE'},select:expect.objectContaining({status:true,source:true,teamIdAtInspection:true,teamNameAtInspection:true,teamAffiliationCapturedAt:true,participant:{select:expect.objectContaining({teamMembership:expect.any(Object)})}})}));
 });
 it.each([{...stage,status:'COMPLETED'},{...stage,date:new Date('2020-01-01')},{...stage,resultsPublishedAt:new Date()}])('does not reconstruct historical teams from current profiles: %j',async history=>{
  const {service,prisma}=setup(history);const result=await service.getStage('stage');
  expect(result.stats.teamParticipation.teams).toEqual([{key:'unknown',name:'Нет данных о команде',participants:2,preliminaryParticipants:0}]);
  expect(prisma.auditLog.findFirst).not.toHaveBeenCalled();
 });
 it('does not use current teams after publication is temporarily reversed',async()=>{
  const {service}=setup(stage,true);const result=await service.getStage('stage');
  expect(result.stats.teamParticipation.preliminaryParticipants).toBe(0);
  expect(result.stats.teamParticipation.teams[0].key).toBe('unknown');
 });
});
