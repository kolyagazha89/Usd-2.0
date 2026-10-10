import { jest } from '@jest/globals';
import { SiteSettingsService } from './site-settings.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SiteSettingsService admin catalogs', () => {
  let service: SiteSettingsService;
  let prisma: any;
  let stored: any;

  beforeEach(() => {
    stored = {
      id: 'default',
      branding: {},
      homepage: {},
      stream: {},
      liveResults: {},
      navigation: {},
      contacts: {},
      social: {},
      seo: {},
      legal: {},
      footer: {},
      registration: { enabled: true, price: 2000, additionalClassPrice: 2000 },
      updatedAt: new Date('2026-10-09T00:00:00.000Z'),
    };
    prisma = {
      siteSettings: {
        findUnique: jest.fn(async () => stored),
        upsert: jest.fn(async (args: any) => {
          stored = { ...stored, ...(args.update ?? args.create), updatedAt: new Date('2026-10-09T00:01:00.000Z') };
          return stored;
        }),
      },
      auditLog: { create: jest.fn(async () => ({ id: 'audit-1' })) },
    };
    service = new SiteSettingsService(prisma as PrismaService);
  });

  it('persists catalogs and stage posters without exposing internal fields in registration settings', async () => {
    const catalogs = {
      teams: ['Bass Syndicate', 'Tyumen Sound'],
      vibrationBrands: ['STP', 'ComfortMat'],
      componentBrands: [{ id: 'brand-1', category: 'AMPLIFIER', name: 'Deaf Bonce', isActive: true }],
      componentModels: [{ id: 'model-1', category: 'AMPLIFIER', brand: 'Deaf Bonce', model: 'AAB-4900.1D', isActive: true }],
    };
    const stagePosters = { 'stage-1': '/media/public-file/SITE_ASSET/stage-poster-stage-1' };

    const result = await service.update({ catalogs, stagePosters }, 'admin-1');

    expect(result.settings.catalogs).toEqual(catalogs);
    expect(result.settings.stagePosters).toEqual(stagePosters);
    expect(result.settings.registration).toEqual({ enabled: true, price: 2000, additionalClassPrice: 2000 });
    expect(stored.registration.__adminCatalogs).toEqual(catalogs);
    expect(stored.registration.__stagePosters).toEqual(stagePosters);
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('returns stage poster references publicly but never returns admin catalogs', async () => {
    stored.registration.__adminCatalogs = { vibrationBrands: ['STP'], componentBrands: [], componentModels: [] };
    stored.registration.__stagePosters = { 'stage-1': '/poster.jpg' };

    const result = await service.getPublic();

    expect(result.settings.stagePosters).toEqual({ 'stage-1': '/poster.jpg' });
    expect(result.settings).not.toHaveProperty('catalogs');
    expect(result.settings.registration).toEqual({ enabled: true, price: 2000, additionalClassPrice: 2000 });
    expect(result.settings.registration).not.toHaveProperty('__adminCatalogs');
    expect(result.settings.registration).not.toHaveProperty('__stagePosters');
  });
});
