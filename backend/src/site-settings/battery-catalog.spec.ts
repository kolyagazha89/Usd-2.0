import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { SiteSettingsService } from './site-settings.service';

describe('CMS battery chemistry and construction', () => {
  const make = () => {
    const db: any = {
      siteSettings: {
        findUnique: jest.fn<any>().mockResolvedValue(null),
        upsert: jest.fn<any>().mockImplementation(async (args: any) => ({ ...args.create })),
      },
      auditLog: { create: jest.fn<any>().mockResolvedValue({}) },
    };
    return { db, service: new SiteSettingsService(db) };
  };

  it('provides separate default chemistry and construction for all seven battery types', async () => {
    const { service } = make();
    const response = await service.getPublic();
    const types = response.settings.catalogs.batteryTypes as Array<any>;
    expect(types).toHaveLength(7);
    expect(types.find(x => x.code === 'NMC')).toMatchObject({ chemistry: 'NMC', construction: 'CELLS' });
    for (const code of ['AGM', 'GEL', 'EFB', 'FLOODED']) {
      expect(types.find(x => x.code === code)?.chemistry).toBe('LEAD_ACID');
    }
  });

  it('persists a valid admin-created battery type', async () => {
    const { db, service } = make();
    await service.update({ catalogs: { batteryTypes: [
      { code: 'TEST_AGM', name: 'Тестовый AGM', chemistry: 'LEAD_ACID', construction: 'AGM', isActive: true },
    ] } }, 'admin');
    expect(db.siteSettings.upsert.mock.calls[0][0].create.catalogs.batteryTypes[0].code).toBe('TEST_AGM');
  });

  it.each([
    [{ code: 'BAD', name: 'Invalid', chemistry: 'LFP', construction: 'AGM', isActive: true }],
    [{ code: 'BAD', name: 'Invalid', chemistry: 'LEAD_ACID', construction: 'CELLS', isActive: true }],
    [{ code: 'bad code', name: 'Invalid', chemistry: 'LTO', construction: 'CELLS', isActive: true }],
  ])('rejects chemically inconsistent or invalid codes', async item => {
    const { db, service } = make();
    await expect(service.update({ catalogs: { batteryTypes: [item] } }, 'admin'))
      .rejects.toThrow(BadRequestException);
    expect(db.siteSettings.upsert).not.toHaveBeenCalled();
  });
});
