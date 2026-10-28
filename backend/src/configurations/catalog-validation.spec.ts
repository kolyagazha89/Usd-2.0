import { BadRequestException } from '@nestjs/common';
import { assertCatalogEquipment } from './catalog-validation';

describe('server-side equipment catalog authorization', () => {
  const subId = '00000000-0000-4000-8000-000000000001';
  const ampId = '00000000-0000-4000-8000-000000000002';
  const catalogs = { componentModels: [
    { id: subId, category: 'SUBWOOFER', brand: 'Deaf Bonce', model: 'Apocalypse', isActive: true },
    { id: ampId, category: 'AMPLIFIER', brand: 'Deaf Bonce', model: 'AAB-2900', isActive: true },
    { id: '00000000-0000-4000-8000-000000000003', category: 'SUBWOOFER',
      brand: 'Deaf Bonce', model: 'Discontinued', isActive: true, lifecycle: 'DISCONTINUED' },
    { id: '00000000-0000-4000-8000-000000000004', category: 'SUBWOOFER',
      brand: 'Deaf Bonce', model: 'Hidden', isActive: false },
  ] };
  const sub = { catalogEntryId: subId, brand: 'Deaf Bonce', model: 'Apocalypse',
    type: 'SUBWOOFER', direction: 'SUB', quantity: 2 };

  it('accepts a valid UUID in the correct category, including discontinued models', () => {
    expect(() => assertCatalogEquipment(catalogs, { audioComponents: [sub],
      amplifiers: [{ catalogEntryId: ampId, brand: 'Deaf Bonce', model: 'AAB-2900',
        direction: 'SUB', quantity: 1 }] })).not.toThrow();
    expect(() => assertCatalogEquipment(catalogs, { audioComponents: [
      { ...sub, catalogEntryId: '00000000-0000-4000-8000-000000000003', model: 'Discontinued' },
    ] })).not.toThrow();
  });

  it.each([
    [{ ...sub, catalogEntryId: undefined }, 'missing UUID'],
    [{ ...sub, catalogEntryId: '00000000-0000-4000-8000-000000000099' }, 'invented UUID'],
    [{ ...sub, catalogEntryId: ampId, model: 'AAB-2900' }, 'wrong category'],
    [{ ...sub, model: 'Invented' }, 'renamed model'],
    [{ ...sub, catalogEntryId: '00000000-0000-4000-8000-000000000004', model: 'Hidden' }, 'inactive model'],
  ])('rejects %s (%s)', row => {
    expect(() => assertCatalogEquipment(catalogs, { audioComponents: [row] }))
      .toThrow(BadRequestException);
  });

  it('accepts curated slug IDs used by existing SPL catalog migrations', () => {
    const slug = 'verified-subwoofer-deaf-bonce-apocalypse-db-sa412-d1-d2';
    const curated = { componentModels: [
      { id: slug, category: 'SUBWOOFER', brand: 'Deaf Bonce',
        model: 'Apocalypse DB-SA412 D1/D2', isActive: true },
    ] };
    expect(() => assertCatalogEquipment(curated, { audioComponents: [
      { catalogEntryId: slug, brand: 'Deaf Bonce', model: 'Apocalypse DB-SA412 D1/D2',
        type: 'SUBWOOFER', direction: 'SUB', quantity: 2 },
    ] })).not.toThrow();
  });

  it('preserves only unchanged historical rows, not duplicates or altered quantities', () => {
    const legacy = { brand: 'Legacy SPL', model: 'Old sub', type: 'SUBWOOFER',
      direction: 'SUB', quantity: 2 };
    expect(() => assertCatalogEquipment(catalogs, { audioComponents: [legacy] },
      { audioComponents: [legacy] })).not.toThrow();
    expect(() => assertCatalogEquipment(catalogs, { audioComponents: [legacy, legacy] },
      { audioComponents: [legacy] })).toThrow(BadRequestException);
    expect(() => assertCatalogEquipment(catalogs, { audioComponents: [{ ...legacy, quantity: 3 }] },
      { audioComponents: [legacy] })).toThrow(BadRequestException);
    expect(() => assertCatalogEquipment(catalogs, { audioComponents: [{ ...legacy, type: 'MIDRANGE' }] },
      { audioComponents: [legacy] })).toThrow(BadRequestException);
    expect(() => assertCatalogEquipment(catalogs, { audioComponents: [{ ...legacy, catalogEntryId: ampId }] },
      { audioComponents: [legacy] })).toThrow(BadRequestException);
  });

  it('requires an active CMS battery code while preserving unchanged legacy batteries', () => {
    const settings = { ...catalogs, batteryTypes: [
      { code: 'LTO', name: 'Литий-титанат', chemistry: 'LTO', construction: 'CELLS', isActive: true },
      { code: 'AGM', name: 'AGM', chemistry: 'LEAD_ACID', construction: 'AGM', isActive: false },
    ] };
    expect(() => assertCatalogEquipment(settings, { batteries: [
      { brand: 'LTO', model: '80', quantity: 2 },
    ] })).not.toThrow();
    expect(() => assertCatalogEquipment(settings, { batteries: [
      { brand: 'AGM', model: '80', quantity: 2 },
    ] })).toThrow(BadRequestException);
    const legacy = { brand: 'Old chemistry', model: '80', quantity: 2 };
    expect(() => assertCatalogEquipment(settings, { batteries: [legacy] },
      { batteries: [legacy] })).not.toThrow();
    expect(() => assertCatalogEquipment(settings, { batteries: [legacy, legacy] },
      { batteries: [legacy] })).toThrow(BadRequestException);
  });

  it('does not allow new arbitrary text when the catalog is empty', () => {
    expect(() => assertCatalogEquipment({}, { audioComponents: [sub] })).toThrow(BadRequestException);
    expect(() => assertCatalogEquipment({}, { audioComponents: [] })).not.toThrow();
  });
});
