import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { ParticipantsService } from './participants.service';
import { emptyPublicationConsent } from './publication-consent';

const version = 'publication-v1.5';
const choices = { ...emptyPublicationConsent(), identity: true, city: false,
  team: false, car: true, profilePhoto: false, carPhoto: false, results: false };
const confirmed = { isPublic: true, publicationConsentAt: new Date('2026-11-16'),
  publicationConsentVersion: version, publicationConsent: choices };

describe('Public profile publication permissions', () => {
  const prisma: any = {
    participant: { findMany: jest.fn(), findUnique: jest.fn() },
    participantMergeRedirect: { findUnique: jest.fn() },
    car: { findUnique: jest.fn() },
    siteSettings: { findUnique: jest.fn() },
  };
  let service: ParticipantsService;
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.siteSettings.findUnique.mockResolvedValue({ legal: { legalApproved: true, legalVersion: '1.5', documents: { photoProfileConsent: { targetId: 'legal-document-photoProfileConsent-current' } } } });
    prisma.participantMergeRedirect.findUnique.mockResolvedValue(null);
    service = new ParticipantsService(prisma);
  });

  it('does not publish any legacy profile merely because isPublic is true', async () => {
    prisma.participant.findMany.mockResolvedValue([
      { id: 'legacy', firstName: 'Иван', lastName: 'Иванов', isPublic: true, photoUrl: '/photo.jpg', cars: [] },
    ]);
    expect(await service.findAll()).toEqual([]);
    prisma.participant.findUnique.mockResolvedValue({ id: 'legacy', firstName: 'Иван', isPublic: true, cars: [] });
    await expect(service.findOne('legacy')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('only returns explicitly permitted fields without leaking the decision record', async () => {
    prisma.participant.findMany.mockResolvedValue([
      { id: 'allowed', ...confirmed, firstName: 'Иван', lastName: 'Иванов',
        city: 'Тюмень', team: 'Команда', photoUrl: '/private.jpg',
        cars: [{ id: 'car', brand: 'Lada', photoUrl: '/car.jpg' }] },
    ]);
    const [person] = await service.findAll();
    expect(person.city).toBeNull();
    expect(person.team).toBeNull();
    expect(person.photoUrl).toBeNull();
    expect(person.cars[0].photoUrl).toBeNull();
    expect(person.publicationConsent).toBeUndefined();
  });

  it('hides participation history unless explicitly permitted and approved', async () => {
    prisma.participant.findUnique.mockResolvedValue({
      id: 'allowed', ...confirmed, city: 'Тюмень', photoUrl: '/private.jpg',
      registrations: [{ id: 'history' }], cars: [{ id: 'car', photoUrl: '/car.jpg' }],
    });
    const person = await service.findOne('allowed');
    expect(person.registrations).toEqual([]);
    expect(person.photoUrl).toBeNull();
    expect(person.cars[0].photoUrl).toBeNull();
    expect(person.publicationConsent).toBeUndefined();
  });

  it('rejects public vehicle details without a valid owner car permission', async () => {
    prisma.car.findUnique.mockResolvedValue({ id: 'car', isActive: true, isPublic: true,
      participant: { id: 'allowed', ...confirmed, publicationConsent: { ...choices, car: false } },
      configurations: [] });
    await expect(service.findCar('car')).rejects.toBeInstanceOf(NotFoundException);
  });
});
