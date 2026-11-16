import {jest} from '@jest/globals';
import {HistoricalResultsService} from './historical-results.service';

describe('Historical public results cannot bypass participant publication permissions',()=>{
  const prisma:any={result:{findFirst:jest.fn()},siteSettings:{findUnique:jest.fn()}};
  const service=new HistoricalResultsService(prisma,{} as any,{} as any);
  const fixture=()=>({
    id:'archived-score',value:149.5,
    registration:{
      id:'reg-1',
      participant:{id:'historical-p',lastName:'Иванов',firstName:'Иван',middleName:null,
        historicalAlias:'Иванов Иван',city:'Тюмень',team:'Легаси',photoUrl:'private-picture',
        isPublic:true,publicationConsent:null},
      car:{id:'car-1',brand:'Машина',model:'Секрет',color:'красный',photoUrl:'private-car',isPublic:true},
    },
  });
  beforeEach(()=>jest.clearAllMocks());

  it('redacts historic names, alias, city, team and pictures without independent permission',async()=>{
    prisma.result.findFirst.mockResolvedValue(fixture());
    const score:any=await service.findPublicOne('archived-score');
    expect(score.value).toBe(149.5);
    expect(score.registration.participant.lastName).toBe('Участник скрыт');
    expect(score.registration.participant.historicalAlias).toBeNull();
    expect(score.registration.participant.city).toBeNull();
    expect(score.registration.participant.team).toBeNull();
    expect(score.registration.participant.photoUrl).toBeNull();
    expect(score.registration.car.brand).toBe('Автомобиль скрыт');
    expect(score.registration.car.photoUrl).toBeNull();
  });

  it('shows only explicit fields when allowed, never assumes photo or city permissions',async()=>{
    const data=fixture();
    data.registration.participant.publicationConsent={fullName:true,results:true,car:true,
      city:false,team:false,profilePhoto:false,carPhoto:false};
    prisma.result.findFirst.mockResolvedValue(data);
    const score:any=await service.findPublicOne('archived-score');
    expect(score.registration.participant.lastName).toBe('Иванов');
    expect(score.registration.participant.city).toBeNull();
    expect(score.registration.participant.photoUrl).toBeNull();
    expect(score.registration.car.brand).toBe('Машина');
    expect(score.registration.car.photoUrl).toBeNull();
  });
});
