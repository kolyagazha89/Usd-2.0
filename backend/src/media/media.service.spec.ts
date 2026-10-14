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
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      siteSettings: { findUnique: jest.fn().mockResolvedValue({}) },
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

  it('requires ADMIN to list the unified media library', async () => {
    await expect(service.listMediaLibrary('JUDGE')).rejects.toBeInstanceOf(ForbiddenException);
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
});
