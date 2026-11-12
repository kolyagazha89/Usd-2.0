import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { MediaTargetType } from '../generated/prisma/enums';
import { MediaService } from './media.service';

describe('venue offline mode does not create media requiring a second transfer', () => {
  const previous = process.env.USD_VENUE_LAN_MODE;
  const prisma = {
    mediaUpload: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    participant: { update: jest.fn() },
  } as any;
  const service = new MediaService(prisma);

  beforeEach(() => {
    process.env.USD_VENUE_LAN_MODE = 'true';
    jest.clearAllMocks();
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.USD_VENUE_LAN_MODE;
    else process.env.USD_VENUE_LAN_MODE = previous;
  });

  it.each([MediaTargetType.PARTICIPANT_PHOTO, MediaTargetType.CAR_PHOTO, MediaTargetType.SITE_ASSET])(
    'rejects prepare for %s even by ADMIN before touching the database', async (targetType) => {
      await expect(service.prepare('admin', 'ADMIN', targetType, 'profile', 'image/png'))
        .rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.mediaUpload.create).not.toHaveBeenCalled();
    },
  );

  it('rejects API upload of previously issued token without finding or writing media', async () => {
    await expect(service.uploadThroughApi('admin', 'ADMIN', 'token', Buffer.from('abc'), 'image/png'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.mediaUpload.findUnique).not.toHaveBeenCalled();
  });

  it('rejects completion of previously issued token without publishing to RustFS', async () => {
    await expect(service.complete('admin', 'ADMIN', 'token'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.mediaUpload.findUnique).not.toHaveBeenCalled();
  });

  it('rejects media deletion while offline before database changes', async () => {
    await expect(service.deleteMediaAsset('admin', 'ADMIN', MediaTargetType.CAR_PHOTO, 'car-id'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.mediaUpload.findMany).not.toHaveBeenCalled();
  });

  it('allows central-online media management to continue unchanged', async () => {
    delete process.env.USD_VENUE_LAN_MODE;
    jest.spyOn(service as any, 'presignedUrl').mockReturnValue('https://example.test/upload');
    jest.spyOn(service as any, 'objectUrl').mockReturnValue('https://example.test/object');
    const result = await service.prepare('admin', 'ADMIN', MediaTargetType.SITE_ASSET, 'branding-logo', 'image/png');
    expect(result.uploadUrl).toBe('https://example.test/upload');
    expect(prisma.mediaUpload.create).toHaveBeenCalledTimes(1);
  });

});
