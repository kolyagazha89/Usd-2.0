import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { ParticipantsService } from './participants.service';

describe('ParticipantsService public profile privacy', () => {
  const prisma: any = {
    participant: { findUnique: jest.fn() },
    car: { findUnique: jest.fn() },
  };
  let service: ParticipantsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ParticipantsService(prisma);
  });

  it('does not expose private participant profiles', async () => {
    prisma.participant.findUnique.mockResolvedValue({
      id: 'private-participant',
      isPublic: false,
      phone: '+79991234567',
      birthDate: new Date('2000-01-01'),
    });

    await expect(service.findOne('private-participant')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('selects only public participant fields and omits contact and registration data', async () => {
    prisma.participant.findUnique.mockResolvedValue({
      id: 'public-participant',
      isPublic: true,
      lastName: 'Иванов',
      firstName: 'Иван',
      middleName: null,
      team: null,
      city: 'Тюмень',
      photoUrl: null,
      cars: [],
    });

    await service.findOne('public-participant');

    const query = prisma.participant.findUnique.mock.calls[0][0];
    expect(query.select).not.toHaveProperty('phone');
    expect(query.select).not.toHaveProperty('birthDate');
    expect(query.select).not.toHaveProperty('user');
    expect(query.select.cars.select).not.toHaveProperty('registrationNumber');
  });

  it('does not expose a private car or a car owned by a private participant', async () => {
    prisma.car.findUnique
      .mockResolvedValueOnce({
        id: 'private-car',
        isActive: true,
        isPublic: false,
        participant: { isPublic: true },
      })
      .mockResolvedValueOnce({
        id: 'car-of-private-participant',
        isActive: true,
        isPublic: true,
        participant: { isPublic: false },
      });

    await expect(service.findCar('private-car')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.findCar('car-of-private-participant'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('only queries participation at published, nondeleted stages', async () => {
    prisma.participant.findUnique.mockResolvedValue({ id: 'person', isPublic: true, registrations: [] });
    await service.findOne('person');
    const query = prisma.participant.findUnique.mock.calls[0][0];
    expect(query.select.registrations.where).toEqual({
      status: 'ACTIVE', stage: { isDeleted: false, status: { in: ['PUBLISHED', 'COMPLETED'] } },
    });
  });

  it('redacts private and inactive cars in public participation history while preserving achievements', async () => {
    prisma.participant.findUnique.mockResolvedValue({
      id: 'person', isPublic: true, cars: [], registrations: [
        { id: 'private-entry', stage: { id: 'stage' }, car: { id: 'private-car', brand: 'Private', model: 'Secret', photoUrl: '/secret', isPublic: false, isActive: true } },
        { id: 'inactive-entry', stage: { id: 'stage' }, car: { id: 'inactive-car', brand: 'Old', model: 'Secret', isPublic: true, isActive: false } },
        { id: 'public-entry', stage: { id: 'stage' }, car: { id: 'public-car', brand: 'Lada', model: 'Vesta', isPublic: true, isActive: true } },
      ],
    });
    const profile = await service.findOne('person');
    expect(profile.registrations.map((row: any) => row.id)).toEqual(['private-entry', 'inactive-entry', 'public-entry']);
    expect(profile.registrations[0].car).toBeNull();
    expect(profile.registrations[1].car).toBeNull();
    expect(profile.registrations[2].car).toMatchObject({ id: 'public-car', brand: 'Lada', model: 'Vesta' });
  });

  it('omits the plate and contact details from the public car response', async () => {
    prisma.car.findUnique.mockResolvedValue({
      id: 'public-car',
      isActive: true,
      isPublic: true,
      brand: 'Lada',
      model: 'Vesta',
      registrationCountry: 'RU',
      color: null,
      photoUrl: null,
      participant: {
        id: 'public-participant',
        isPublic: true,
        lastName: 'Иванов',
        firstName: 'Иван',
        middleName: null,
        team: null,
        city: 'Тюмень',
        photoUrl: null,
      },
      configurations: [],
    });

    await service.findCar('public-car');

    const query = prisma.car.findUnique.mock.calls[0][0];
    expect(query.select).not.toHaveProperty('registrationNumber');
    expect(query.select.participant.select).not.toHaveProperty('phone');
    expect(query.select.participant.select).not.toHaveProperty('birthDate');
    expect(query.select.participant.select).not.toHaveProperty('user');
  });
});
