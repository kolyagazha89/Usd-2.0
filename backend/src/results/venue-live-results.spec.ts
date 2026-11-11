import {jest} from '@jest/globals';
import {ResultsService} from './results.service';

describe('venue-only live results', () => {
  const stageId='c510f672-79f7-44eb-8173-2a8ff94b1c0e';
  const prisma:any={
    stage:{findFirst:jest.fn()},
    result:{findMany:jest.fn()},
  };
  const service=new ResultsService(prisma,{} as any,{} as any);
  const prior={mode:process.env.USD_VENUE_LAN_MODE,stage:process.env.VENUE_STAGE_ID};
  beforeEach(()=>{
    jest.clearAllMocks();
    delete process.env.USD_VENUE_LAN_MODE;
    delete process.env.VENUE_STAGE_ID;
    prisma.stage.findFirst.mockResolvedValue({
      id:stageId,name:'Этап USD',city:'Тюмень',date:new Date('2026-12-01T00:00:00Z'),
    });
    prisma.result.findMany.mockResolvedValue([]);
  });
  afterAll(()=>{
    if(prior.mode===undefined)delete process.env.USD_VENUE_LAN_MODE;
    else process.env.USD_VENUE_LAN_MODE=prior.mode;
    if(prior.stage===undefined)delete process.env.VENUE_STAGE_ID;
    else process.env.VENUE_STAGE_ID=prior.stage;
  });
  it('is not available on the main public API, even if stage env is present',async()=>{
    process.env.VENUE_STAGE_ID=stageId;
    await expect(service.findVenueLive()).rejects.toThrow('Локальное табло недоступно');
    expect(prisma.stage.findFirst).not.toHaveBeenCalled();
    expect(prisma.result.findMany).not.toHaveBeenCalled();
  });
  it('refuses a missing or malformed stage pin, before any database read',async()=>{
    process.env.USD_VENUE_LAN_MODE='true';
    for(const id of ['', 'not-a-uuid', '00000000-0000-0000-0000-000000000000']){
      process.env.VENUE_STAGE_ID=id;
      await expect(service.findVenueLive()).rejects.toThrow('Локальное табло недоступно');
    }
    expect(prisma.stage.findFirst).not.toHaveBeenCalled();
  });
  it('does not show deleted or non-running stages',async()=>{
    process.env.USD_VENUE_LAN_MODE='true';
    process.env.VENUE_STAGE_ID=stageId;
    prisma.stage.findFirst.mockResolvedValue(null);
    await expect(service.findVenueLive()).rejects.toThrow('Этап для локального табло не найден');
    expect(prisma.result.findMany).not.toHaveBeenCalled();
    expect(prisma.stage.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where:{id:stageId,isDeleted:false,status:{in:['PUBLISHED','COMPLETED']}},
    }));
  });
  it('reads only this active venue stage without waiting for public publication',async()=>{
    process.env.USD_VENUE_LAN_MODE='true';
    process.env.VENUE_STAGE_ID=stageId;
    await service.findVenueLive();
    expect(prisma.result.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where:{registration:{stageId,status:'ACTIVE'}},
    }));
    const query=prisma.result.findMany.mock.calls[0][0] as any;
    expect(query.select).toBeDefined();
    expect(query.include).toBeUndefined();
    expect(JSON.stringify(query.select)).not.toMatch(/email|phone|password|registrationNumber|notes|createdByUser/i);
  });
  it('only sends public names, car models, class, number and result — never a profile or plate',async()=>{
    process.env.USD_VENUE_LAN_MODE='true';
    process.env.VENUE_STAGE_ID=stageId;
    prisma.result.findMany.mockResolvedValue([
      {id:'result-1',value:{toString:()=> '158.250'},unit:'DB',place:1,
        registration:{participantNumber:9,
          participant:{lastName:'Секретов',firstName:'Иван',middleName:'Иванович',isPublic:false},
          car:{brand:'Тайная',model:'Модель',isPublic:false,isActive:true}},
        registrationClass:{number:{number:19},class:{id:'cls',name:'Limited 2.0',unit:'DB',sortOrder:1,direction:{name:'SPL',sortOrder:2}}},
      },
      {id:'result-2',value:143.5,unit:'DB',place:2,
        registration:{participantNumber:7,
          participant:{lastName:'Петров',firstName:'Петр',middleName:null,isPublic:true},
          car:{brand:'Лада',model:'Веста',isPublic:true,isActive:true}},
        registrationClass:{number:null,class:{id:'cls',name:'Limited 2.0',unit:'DB',sortOrder:1,direction:{name:'SPL',sortOrder:2}}},
      },
    ]);
    const payload=await service.findVenueLive();
    expect(payload.stage.name).toBe('Этап USD');
    expect(payload.rows).toHaveLength(2);
    expect(payload.rows[0]).toMatchObject({number:19,participant:'Участник скрыт',car:'Автомобиль скрыт',value:'158.250',place:1});
    expect(payload.rows[1]).toMatchObject({number:7,participant:'Петров Петр',car:'Лада Веста'});
    expect(JSON.stringify(payload)).not.toMatch(/Секретов|Тайная|телефон|@example|registrationNumber/);
  });
});