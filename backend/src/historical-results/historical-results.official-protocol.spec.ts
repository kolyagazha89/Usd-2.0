import { jest } from '@jest/globals';
import { HistoricalResultsService } from './historical-results.service';

describe('historical official protocols keep athletes identified', () => {
  const prisma: any = { result: { findFirst: jest.fn() } };
  const service = new HistoricalResultsService(prisma, {} as any, {} as any);
  beforeEach(() => jest.clearAllMocks());

  it('returns the historical full name and alias even for an unpublished profile, without leaking city, team, photo or vehicle', async () => {
    prisma.result.findFirst.mockResolvedValue({
      id: 'official-archive', value: 154.8, place: 1, verificationStatus: 'VERIFIED',
      registration: {
        participant: { id:'p1', firstName:'Иван', lastName:'Иванов', middleName:'Петрович',
          historicalAlias:'Иванов Иван', isPublic:false, city:'Частный город', team:'Закрытая команда',
          photoUrl:'private-photo' },
        car: { id:'c1', brand:'Тайная', model:'Машина', photoUrl:'private-car', isPublic:false },
      },
    });
    const row: any = await service.findPublicOne('official-archive');
    expect(row).toMatchObject({ value:154.8, place:1 });
    expect(row.registration.participant).toMatchObject({
      firstName:'Иван',lastName:'Иванов',middleName:'Петрович',historicalAlias:'Иванов Иван',
      city:null,team:null,photoUrl:null,isPublic:false,
    });
    expect(row.registration.car).toMatchObject({
      brand:'Автомобиль скрыт',model:'',photoUrl:null,
    });
    expect(prisma.result.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where:expect.objectContaining({isHistorical:true,verificationStatus:'VERIFIED'}),
    }));
  });
});
