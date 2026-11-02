import { jest } from '@jest/globals';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MediaTargetType } from '../generated/prisma/enums';
import { MediaService } from './media.service';

describe('MediaService media library', () => {
  let prisma: any;
  let service: MediaService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    prisma = {
      mediaUpload: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      siteSettings: { findUnique: jest.fn().mockResolvedValue({}) },
      teamPost: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue(null) },
      participant: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      car: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
      $transaction: jest.fn(async (callback: (tx: any) => Promise<unknown>) => callback(prisma)),
    };
    service = new MediaService(prisma);
    (service as any).presignedUrl = jest.fn(() => 'https://storage.example/signed');
    global.fetch = jest.fn(async () => ({ ok: true, status: 204 } as Response)) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('blocks direct access to a legal DOCX until it is attached and approved', async () => {
    const targetId = 'legal-document-privacyPolicy-random-id';
    prisma.siteSettings.findUnique.mockResolvedValue({
      legal: { legalApproved: false, documents: { privacyPolicy: { targetId } } },
    });

    await expect(service.getPublicMediaFile(MediaTargetType.SITE_ASSET, targetId))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.mediaUpload.findFirst).not.toHaveBeenCalled();
  });

  it('blocks legal DOCX that is not attached to the approved version', async () => {
    const targetId = 'legal-document-privacyPolicy-random-id';
    prisma.siteSettings.findUnique.mockResolvedValue({
      legal: { legalApproved: true, documents: {} },
    });

    await expect(service.getPublicMediaFile(MediaTargetType.SITE_ASSET, targetId))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.mediaUpload.findFirst).not.toHaveBeenCalled();
  });

  it('never serves an unauthorized private participant photo', async () => {
    prisma.participant.findFirst = jest.fn().mockResolvedValue(null);
    await expect(service.getPrivateMediaFile('other-user', 'PARTICIPANT', MediaTargetType.PARTICIPANT_PHOTO, 'participant-1'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('serves authorized private media through the API without exposing a signed S3 URL', async () => {
    prisma.mediaUpload.findFirst.mockResolvedValue({ objectKey: 'private-key', contentType: 'image/png' });
    global.fetch = jest.fn(async () => new Response(Buffer.from([0x89,0x50,0x4e,0x47]), {
      status: 200,
      headers: { 'content-type':'image/png' },
    })) as typeof fetch;
    const result = await service.getPrivateMediaFile('admin-user', 'ADMIN', MediaTargetType.SITE_ASSET, 'logo');
    expect(result.contentType).toBe('image/png');
    expect(result.body).toEqual(Buffer.from([0x89,0x50,0x4e,0x47]));
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('requires ADMIN to list the unified media library', async () => {
    await expect(service.listMediaLibrary('PARTICIPANT')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lists only the latest version per target and marks referenced site assets', async () => {
    prisma.mediaUpload.findMany.mockResolvedValue([
      { id: 'latest', targetType: MediaTargetType.SITE_ASSET, targetId: 'branding-logoUrl', contentType: 'image/png', completedAt: new Date('2026-10-13T12:00:00Z'), createdAt: new Date(), objectKey: 'new-key' },
      { id: 'old', targetType: MediaTargetType.SITE_ASSET, targetId: 'branding-logoUrl', contentType: 'image/png', completedAt: new Date('2026-10-12T12:00:00Z'), createdAt: new Date(), objectKey: 'old-key' },
      { id: 'participant', targetType: MediaTargetType.PARTICIPANT_PHOTO, targetId: 'participant-1', contentType: 'image/jpeg', completedAt: new Date(), createdAt: new Date(), objectKey: 'participant-key' },
    ]);
    prisma.siteSettings.findUnique.mockResolvedValue({
      branding: { logoUrl: 'https://app.example/media/public-file/SITE_ASSET/branding-logoUrl' },
    });

    const result = await service.listMediaLibrary('ADMIN');

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ id: 'latest', targetId: 'branding-logoUrl', isReferenced: true, canDelete: false });
    expect(result.items[1]).toMatchObject({ id: 'participant', targetType: MediaTargetType.PARTICIPANT_PHOTO, canDelete: true });
  });

  it('prevents deletion of site assets that are referenced by settings', async () => {
    prisma.mediaUpload.findMany.mockResolvedValue([
      { id: 'upload-1', objectKey: 'logo-key', contentType: 'image/png' },
    ]);
    prisma.siteSettings.findUnique.mockResolvedValue({
      branding: { logoUrl: 'https://app.example/media/public-file/SITE_ASSET/branding-logoUrl' },
    });

    await expect(service.deleteMediaAsset('admin-1', 'ADMIN', MediaTargetType.SITE_ASSET, 'branding-logoUrl'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(prisma.mediaUpload.deleteMany).not.toHaveBeenCalled();
  });

  it('clears participant photo references and audits media deletion', async () => {
    prisma.mediaUpload.findMany.mockResolvedValue([
      { id: 'upload-1', objectKey: 'photo-key', contentType: 'image/jpeg' },
    ]);

    const result = await service.deleteMediaAsset('admin-1', 'ADMIN', MediaTargetType.PARTICIPANT_PHOTO, 'participant-1');

    expect(prisma.participant.updateMany).toHaveBeenCalledWith({
      where: { id: 'participant-1' },
      data: { photoUrl: null },
    });
    expect(prisma.mediaUpload.deleteMany).toHaveBeenCalledWith({
      where: { targetType: MediaTargetType.PARTICIPANT_PHOTO, targetId: 'participant-1', completedAt: { not: null } },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'MEDIA_ASSET_DELETED', entityId: 'participant-1' }),
    }));
    expect(result).toMatchObject({ success: true, targetType: MediaTargetType.PARTICIPANT_PHOTO, deletedVersions: 1, storageCleanupPending: false });
  });

  const postId = '00000000-0000-4000-8000-000000000131';
  const slot = '00000000-0000-4000-8000-000000000132';
  const teamImage = 'team-post-' + postId + '-' + slot;

  it('rejects public team photos from unpublished or unattached drafts', async () => {
    prisma.teamPost.findFirst.mockResolvedValue(null);
    await expect(service.getPublicMediaFile(MediaTargetType.SITE_ASSET, teamImage))
      .rejects.toBeInstanceOf(ForbiddenException);
    prisma.teamPost.findFirst.mockResolvedValue({ images: [] });
    await expect(service.getSignedPublicMediaUrl(MediaTargetType.SITE_ASSET, teamImage))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.mediaUpload.findFirst).not.toHaveBeenCalled();
  });

  it('allows only the matching team commander to upload a draft image', async () => {
    prisma.teamPost.findUnique.mockResolvedValue({
      status:'DRAFT',team:{isActive:true,commanderUserId:'commander-1'},
    });
    await expect(service.prepare('stranger','PARTICIPANT',MediaTargetType.SITE_ASSET,teamImage,'image/png'))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.prepare('commander-1','PARTICIPANT',MediaTargetType.SITE_ASSET,teamImage,'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
      .rejects.toThrow('только JPG');
    prisma.teamPost.findUnique.mockResolvedValue({
      status:'IN_REVIEW',team:{isActive:true,commanderUserId:'commander-1'},
    });
    await expect(service.prepare('commander-1','PARTICIPANT',MediaTargetType.SITE_ASSET,teamImage,'image/png'))
      .rejects.toBeInstanceOf(ForbiddenException);
    prisma.teamPost.findUnique.mockResolvedValue({
      status:'PUBLISHED',team:{isActive:true,commanderUserId:'commander-1'},
    });
    await expect(service.prepare('commander-1','PARTICIPANT',MediaTargetType.SITE_ASSET,teamImage,'image/png'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.mediaUpload.findFirst).not.toHaveBeenCalled();
  });

  it('allows a commander to preview their own queued photos but not modify them',async()=>{
    prisma.teamPost.findUnique.mockResolvedValue({
      status:'IN_REVIEW',team:{isActive:true,commanderUserId:'commander-1'},
    });
    prisma.mediaUpload.findFirst.mockResolvedValue({objectKey:'review-photo',contentType:'image/png'});
    global.fetch=jest.fn(async()=>new Response(Buffer.from([137,80,78,71]),{
      status:200,headers:{'content-type':'image/png'},
    })) as typeof fetch;
    const image=await service.getPrivateMediaFile('commander-1','PARTICIPANT',MediaTargetType.SITE_ASSET,teamImage);
    expect(image.contentType).toBe('image/png');
    await expect(service.getPrivateMediaFile('other-commander','PARTICIPANT',MediaTargetType.SITE_ASSET,teamImage))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.prepare('commander-1','PARTICIPANT',MediaTargetType.SITE_ASSET,teamImage,'image/png'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('never issues non-revocable signed S3 links for moderated photos', async()=>{
    prisma.teamPost.findFirst.mockResolvedValue({images:[teamImage]});
    await expect(service.getSignedPublicMediaUrl(MediaTargetType.SITE_ASSET,teamImage))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getSignedViewUrl('admin','ADMIN',MediaTargetType.SITE_ASSET,teamImage))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('serves an image only when ADMIN published a post that references its exact key', async () => {
    prisma.teamPost.findFirst.mockResolvedValue({images:[teamImage]});
    prisma.mediaUpload.findFirst.mockResolvedValue({objectKey:'secret-object',contentType:'image/png'});
    global.fetch=jest.fn(async()=>new Response(Buffer.from([137,80,78,71]),{
      status:200,headers:{'content-type':'image/png'},
    })) as typeof fetch;
    const image=await service.getPublicMediaFile(MediaTargetType.SITE_ASSET,teamImage);
    expect(image.contentType).toBe('image/png');
    expect(prisma.teamPost.findFirst).toHaveBeenCalledWith({
      where:{id:postId,status:'PUBLISHED'},select:{images:true},
    });
  });

  it('protects attached team images in the media library even before publication',async()=>{
    prisma.teamPost.findMany.mockResolvedValue([{images:[teamImage]}]);
    prisma.mediaUpload.findMany.mockResolvedValue([{
      id:'asset',targetType:MediaTargetType.SITE_ASSET,targetId:teamImage,
      contentType:'image/webp',completedAt:new Date(),createdAt:new Date(),objectKey:'object',
    }]);
    const listed=await service.listMediaLibrary('ADMIN');
    expect(listed.items[0]).toMatchObject({isReferenced:true,canDelete:false});
    await expect(service.deleteMediaAsset('admin','ADMIN',MediaTargetType.SITE_ASSET,teamImage))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.mediaUpload.deleteMany).not.toHaveBeenCalled();
  });
});
