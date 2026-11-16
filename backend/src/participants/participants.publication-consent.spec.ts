import { jest } from '@jest/globals';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ParticipantsService } from './participants.service';

describe('Explicit participant publication permissions', () => {
  let prisma: any;
  let service: ParticipantsService;
  const request: any = { user: { sub: 'user-1' } };
  const permissions = {
    fullName: true, city: false, team: false, results: true,
    car: false, profilePhoto: false, carPhoto: false,
    eventImage: false, promotionalImage: false,
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({id:'user-1', role:'PARTICIPANT', participantId:'person-1', isActive:true}) },
      participant: { findUnique: jest.fn().mockResolvedValue({id:'person-1',isPublic:false,birthDate:new Date('1990-01-01')}), update: jest.fn().mockResolvedValue({id:'person-1'}) },
      car: { updateMany: jest.fn().mockResolvedValue({count:1}) },
      participantPublicationConsent: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({participantId:'person-1', ...permissions, textVersion:'1.5'}),
      },
      siteSettings: { findUnique: jest.fn().mockResolvedValue({ legal: { legalApproved:true, legalVersion:'1.5', documents:{photoProfileConsent:{targetId:'legal-document-photoProfileConsent-test'}}} }) },
      auditLog: {create:jest.fn().mockResolvedValue({id:'audit'})},
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    service = new ParticipantsService(prisma);
  });

  it('defaults every publication choice to false for legacy participants', async () => {
    const result: any = await service.getMyPublicationConsent(request);
    expect(result.permissions).toEqual({
      fullName:false, city:false, team:false, results:false, car:false,
      profilePhoto:false, carPhoto:false, eventImage:false, promotionalImage:false,
    });
  });

  it('preserves independent selections and evidence for the published document version', async () => {
    const result: any = await service.updateMyPublicationConsent(request,{...permissions});
    expect(result.version).toBe('1.5');
    expect(prisma.participantPublicationConsent.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where:{participantId:'person-1'},
      create:expect.objectContaining({textVersion:'1.5', fullName:true, city:false, results:true, profilePhoto:false}),
    }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data:expect.objectContaining({action:'PUBLICATION_CONSENT_UPDATED'})
    }));
  });

  it('refuses publication consent until the actual optional document is approved', async () => {
    prisma.siteSettings.findUnique.mockResolvedValue({legal:{legalApproved:false}});
    await expect(service.updateMyPublicationConsent(request,{...permissions})).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.participantPublicationConsent.upsert).not.toHaveBeenCalled();
  });

  it('never grants permission by omission or a malformed selection', async () => {
    await expect(service.updateMyPublicationConsent(request,{fullName:true} as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.participantPublicationConsent.upsert).not.toHaveBeenCalled();
  });

  it('requires an age to be provided before enabling any public publication', async () => {
    prisma.participant.findUnique.mockResolvedValue({id:'person-1',birthDate:null});
    await expect(service.updateMyPublicationConsent(request,{...permissions})).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.participantPublicationConsent.upsert).not.toHaveBeenCalled();
  });

  it('refuses self-service publication by a minor without a verified legal representative', async () => {
    prisma.participant.findUnique.mockResolvedValue({id:'person-1',birthDate:new Date('2012-01-01')});
    await expect(service.updateMyPublicationConsent(request,{...permissions})).rejects.toBeInstanceOf(ForbiddenException);
  });
});
