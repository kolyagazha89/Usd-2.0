import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { ParticipantsService } from './participants.service';
import { emptyPublicationConsent } from './publication-consent';

const version = 'publication-v1.5@legal-document-photoProfileConsent-current';
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
    prisma.siteSettings.findUnique.mockResolvedValue({ legal: { legalApproved: true, legalVersion: '1.5', documents: { photoProfileConsent: { targetId: 'legal-document-photoProfileConsent-current', url: 'https://example.org/photo-profile.docx' } } } });
    prisma.participantMergeRedirect.findUnique.mockResolvedValue(null);
    service = new ParticipantsService(prisma);
  });

  it('keeps a previously consented participant publicly visible after an unrelated legal version bump', async () => {
    prisma.siteSettings.findUnique.mockResolvedValueOnce({ legal: { legalApproved: true, legalVersion: '8',
      documents: { photoProfileConsent: { targetId: 'legal-document-photoProfileConsent-current',
        url: 'https://example.org/photo-profile.docx' } } } });
    prisma.participant.findMany.mockResolvedValue([
      { id: 'previously-consented', ...confirmed, lastName: 'Иванов', firstName: 'Иван',
        city: 'Тюмень', team: 'Команда', photoUrl: '/photo.jpg', cars: [] },
    ]);
    const people = await service.findAll();
    expect(people.map((person: any) => person.id)).toEqual(['previously-consented']);
    expect(people[0].city).toBeNull();
    expect(people[0].team).toBeNull();
    expect(people[0].photoUrl).toBeNull();
  });

  it('shows an existing explicit decision as confirmed to its owner after a general legal version bump', async () => {
    const local:any = {
      user:{findUnique:jest.fn().mockResolvedValue({id:'user-1',isActive:true,role:'PARTICIPANT',participantId:'participant-1'})},
      siteSettings:{findUnique:jest.fn().mockResolvedValue({legal:{legalApproved:true,legalVersion:'8',
        documents:{photoProfileConsent:{targetId:'legal-document-photoProfileConsent-current',
          url:'https://example.org/profile.docx'}}}})},
      participant:{findUnique:jest.fn().mockResolvedValue({id:'participant-1',...confirmed})},
    };
    const view = await new ParticipantsService(local).getPublicationConsent({user:{sub:'user-1',role:'PARTICIPANT'}} as any);
    expect(view.confirmed).toBe(true);
    expect(view.choices.identity).toBe(true);
    expect(view.choices.profilePhoto).toBe(false);
    expect(view.recordedAt).toEqual(confirmed.publicationConsentAt);
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
    expect(person).not.toHaveProperty('publicationTerms');
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
  it('does not accept optional publication permission from a minor or an unverified age, but still permits full withdrawal',async()=>{
    const local:any={
      user:{findUnique:jest.fn().mockResolvedValue({id:'user-1',isActive:true,role:'PARTICIPANT',participantId:'participant-1'})},
      siteSettings:{findUnique:jest.fn().mockResolvedValue({legal:{legalApproved:true,legalVersion:'1.5',
        documents:{photoProfileConsent:{targetId:'legal-document-photoProfileConsent-current',url:'https://example.org/profile.docx'}}}})},
      participant:{findUnique:jest.fn().mockResolvedValue({id:'participant-1',birthDate:null}),update:jest.fn().mockResolvedValue({})},
      auditLog:{create:jest.fn().mockResolvedValue({})},
    };
    local.$transaction=jest.fn(async (fn:any)=>fn(local));
    const actor:any={user:{sub:'user-1',role:'PARTICIPANT'}};
    const service=new ParticipantsService(local);
    await expect(service.updatePublicationConsent(actor,{choices:{...emptyPublicationConsent(),identity:true}}))
      .rejects.toThrow('укажите дату рождения');
    local.participant.findUnique.mockResolvedValue({id:'participant-1',birthDate:new Date('2015-03-01')});
    await expect(service.updatePublicationConsent(actor,{choices:{...emptyPublicationConsent(),identity:true}}))
      .rejects.toThrow('законный представитель');
    expect(local.participant.update).not.toHaveBeenCalled();
    const revoked=await service.updatePublicationConsent(actor,{choices:emptyPublicationConsent()});
    expect(revoked.confirmed).toBe(true);
    expect(local.participant.update).toHaveBeenCalledTimes(1);
  });
});
