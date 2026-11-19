import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { ParticipantsService } from './participants.service';

describe('Historical car visibility without losing registrations and results', () => {
  const user = { findUnique: jest.fn() };
  const car = { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() };
  const registration = { count: jest.fn() };
  const participant = { findUnique: jest.fn() };
  const prisma: any = { user, car, registration, participant };
  const admin: any = { user: { sub: 'admin', role: 'ADMIN' } };
  const judge: any = { user: { sub: 'judge', role: 'PARTICIPANT', customRoleId: 'judge-role' } };
  let service: ParticipantsService;

  beforeEach(() => {
    jest.clearAllMocks();
    user.findUnique.mockImplementation(async ({where}:any) =>
      where.id === 'judge'
        ? {id:'judge',role:'PARTICIPANT',isActive:true,customRoleId:'judge-role',participantId:null}
        : where.id === 'member'
          ? {id:'member',role:'PARTICIPANT',isActive:true,customRoleId:null,participantId:'old-person'}
          : where.id === 'other'
            ? {id:'other',role:'PARTICIPANT',isActive:true,customRoleId:null,participantId:'other-person'}
            : {id:'admin',role:'ADMIN',isActive:true,customRoleId:null,participantId:null});
    car.findUnique.mockResolvedValue({ id: 'historical-car', participantId: 'old-person',
      brand: 'ВАЗ', model: '2107', registrationCountry: 'RU',
      registrationNumber: 'А123ВС77', isActive: true, isPublic: true });
    car.update.mockImplementation(async ({data}:any) => ({id:'historical-car',...data}));
    car.findMany.mockResolvedValue([]);
    registration.count.mockResolvedValue(0);
    participant.findUnique.mockResolvedValue({id:'old-person'});
    service = new ParticipantsService(prisma);
  });

  it('lists active cars only on the normal administrator screen', async () => {
    await service.findAllCars(admin);
    expect(car.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {isActive: true},
    }));
  });

  it('shows hidden cars only when the administrator requests their separate tab', async () => {
    await service.findAllCars(admin, 'hidden');
    expect(car.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {isActive: false},
    }));
  });

  it('does not disclose hidden cars to a judge via a crafted query', async () => {
    await expect(service.findAllCars(judge, 'hidden')).rejects.toBeInstanceOf(ForbiddenException);
    expect(car.findMany).not.toHaveBeenCalled();
  });

  it('keeps archived cars out of participant car pickers for an administrator', async () => {
    await service.findCars(admin, 'old-person');
    expect(car.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {participantId:'old-person',isActive:true},
    }));
  });

  it('hides an old imported vehicle while preserving its linked historical results', async () => {
    await service.updateCar(admin, 'historical-car', {isActive:false});
    expect(registration.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        carId:'historical-car', status:'ACTIVE',
        stage: expect.objectContaining({status:'PUBLISHED',date:expect.objectContaining({gte:expect.any(Date)})}),
      }),
    }));
    expect(car.update).toHaveBeenCalledWith(expect.objectContaining({
      where:{id:'historical-car'},
      data:expect.objectContaining({isActive:false,isPublic:false}),
    }));
    // Hiding must not delete the vehicle, registration, result or sticker numbers.
    expect(car.update).toHaveBeenCalledTimes(1);
  });

  it('refuses hiding a car still registered for a current or future competition', async () => {
    registration.count.mockResolvedValueOnce(1);
    await expect(service.updateCar(admin,'historical-car',{isActive:false}))
      .rejects.toThrow('активной регистрации');
    expect(car.update).not.toHaveBeenCalled();
  });

  it('restores a hidden car without automatically republishing it', async () => {
    await service.updateCar(admin,'historical-car',{isActive:true});
    expect(car.update).toHaveBeenCalledWith(expect.objectContaining({
      data:{isActive:true},
    }));
  });

  const member: any = { user: { sub: 'member', role: 'PARTICIPANT' } };
  const other: any = { user: { sub: 'other', role: 'PARTICIPANT' } };

  it('returns only active vehicles from the normal member garage', async () => {
    await service.findMyCars(member);
    expect(car.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {participantId:'old-person',isActive:true},
    }));
  });

  it('allows the owner to load only their own hidden cars on demand', async () => {
    await service.findMyCars(member, 'hidden');
    expect(car.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {participantId:'old-person',isActive:false},
    }));
  });

  it('does not return hidden cars on malformed visibility requests', async () => {
    await expect(service.findMyCars(member, 'everything' as any)).rejects.toThrow('категория');
    expect(car.findMany).not.toHaveBeenCalled();
  });

  it('lets a member hide an owned car without losing historical registrations', async () => {
    await service.updateCar(member, 'historical-car', {isActive:false});
    expect(car.update).toHaveBeenCalledWith(expect.objectContaining({
      where:{id:'historical-car'},data:expect.objectContaining({isActive:false,isPublic:false}),
    }));
  });

  it('lets the owner restore a hidden car without republishing it', async () => {
    await service.updateCar(member, 'historical-car', {isActive:true});
    expect(car.update).toHaveBeenCalledWith(expect.objectContaining({
      data:{isActive:true},
    }));
  });

  it('blocks a member from hiding a vehicle registered for an upcoming event', async () => {
    registration.count.mockResolvedValueOnce(1);
    await expect(service.updateCar(member,'historical-car',{isActive:false}))
      .rejects.toThrow('активной регистрации');
    expect(car.update).not.toHaveBeenCalled();
  });

  it('never allows members to hide or restore somebody else’s car', async () => {
    await expect(service.updateCar(other,'historical-car',{isActive:false}))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.updateCar(other,'historical-car',{isActive:true}))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(car.update).not.toHaveBeenCalled();
  });
});
