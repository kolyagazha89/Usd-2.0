import { jest } from '@jest/globals';
import { RecordsService } from './records.service';

describe('all-time record official athlete identity', () => {
  it('preserves published record winner name with a private participant profile, while masking personal metadata', () => {
    const service = new RecordsService({} as any);
    const row: any = (service as any).sanitizePublicRecord({
      id:'r1',
      value:152.0,
      result:{registration:{
        participant:{id:'p1',isPublic:false,firstName:'Павел',lastName:'Петров',middleName:null,
          city:'Закрытый город',team:'Закрытая команда',photoUrl:'private.jpg'},
        car:{id:'c1',isPublic:false,brand:'Приватный',model:'Автомобиль',color:'красный',photoUrl:'car.jpg'},
      }},
    });
    expect(row.value).toBe(152.0);
    expect(row.result.registration.participant).toMatchObject({
      firstName:'Павел',lastName:'Петров',city:null,team:null,photoUrl:null,
    });
    expect(row.result.registration.car).toMatchObject({
      brand:'Автомобиль скрыт',model:'',photoUrl:null,
    });
  });
});
