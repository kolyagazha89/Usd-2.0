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
   {id:'r3',participantId:'p3',carId:'car3',participantNumber:4,configurationSnapshot:{configurationPending:false},participant,car,classes:[],inspection:null,stageInspection:{status:'PENDING',notes:null}},
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
