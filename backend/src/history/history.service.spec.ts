import {jest} from '@jest/globals';
import {HistoryService} from './history.service';

describe('participant history excludes archived imported vehicles without losing results',()=>{
 it('omits hidden cars from participant garage and redacts historic registration details',async()=>{
  const prisma:any={
   participant:{findUnique:jest.fn<any>().mockResolvedValue({id:'person',firstName:'Иван',lastName:'Иванов',cars:[]})},
   registration:{findMany:jest.fn<any>().mockResolvedValue([{
    id:'registration-2019',participantNumber:14,status:'ACTIVE',stageId:'2019-final',
    car:{id:'imported-old',brand:'Старый импорт',model:'Архивная',isActive:false,
     registrationNumber:'А123ВС77',registrationCountry:'RU',photoUrl:'/cars/old.jpg',color:'чёрный'},
    results:[{id:'result-2019',value:165.2,place:1}],
   }])},
   record:{findMany:jest.fn<any>().mockResolvedValue([{id:'record-2019',value:165.2,isCurrent:true}])},
  };
  const service=new HistoryService(prisma);
  const history=await service.getParticipantHistory('person','ADMIN');
  expect(prisma.participant.findUnique).toHaveBeenCalledWith(expect.objectContaining({
   select:expect.objectContaining({cars:expect.objectContaining({where:{isActive:true}})}),
  }));
  expect(prisma.registration.findMany.mock.calls[0][0].select.car.select.isActive).toBe(true);
  expect(history.cars).toEqual([]);
  expect(history.registrations[0].car).toMatchObject({
   id:'imported-old',brand:'Автомобиль скрыт',registrationNumber:null,photoUrl:null,
  });
  expect(history.registrations[0].results).toEqual([{id:'result-2019',value:165.2,place:1}]);
  expect(history.records[0].id).toBe('record-2019');
 });
});
