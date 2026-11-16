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
    [{ ...sub, catalogEntryId: '00000000-0000-4000-8000-000000000099' }, 'invented UUID'],
    [{ ...sub, catalogEntryId: ampId, model: 'AAB-2900' }, 'wrong category'],
    [{ ...sub, model: 'Invented' }, 'renamed model'],
    [{ ...sub, catalogEntryId: '00000000-0000-4000-8000-000000000004', model: 'Hidden' }, 'inactive model'],
  ])('rejects %s (%s)', row => {
    expect(() => assertCatalogEquipment(catalogs, { audioComponents: [row] }))
      .toThrow(BadRequestException);
  });

  it('accepts manually entered brand and model without a catalog ID or admin request', () => {
    expect(() => assertCatalogEquipment(catalogs, {
      audioComponents: [{ brand: 'Custom Audio', model: 'Prototype 18', type: 'SUBWOOFER', direction: 'SUB', quantity: 2 }],
      amplifiers: [{ brand: 'Unknown Amps', model: 'One-off 5000', direction: 'SUB', quantity: 1 }],
      headUnits: [{ brand: 'Handmade', model: 'Source X', direction: 'FRONT' }],
    })).not.toThrow();
    expect(() => assertCatalogEquipment({}, {
      audioComponents: [{ brand: 'No catalog', model: 'Independent', type: 'MIDBASS', direction: 'FRONT', quantity: 1 }],
    })).not.toThrow();
    expect(() => assertCatalogEquipment(catalogs, {
      audioComponents: [{ ...sub, catalogEntryId: undefined }],
    })).not.toThrow();
  });

  it.each([
    [{ brand: '', model: 'Prototype', type: 'SUBWOOFER' }, 'empty brand'],
    [{ brand: '  ', model: 'Prototype', type: 'SUBWOOFER' }, 'whitespace brand'],
    [{ brand: 'Custom', model: '   ', type: 'SUBWOOFER' }, 'whitespace model'],
    [{ brand: 'X'.repeat(101), model: 'Prototype', type: 'SUBWOOFER' }, 'overlong brand'],
    [{ brand: 'Custom', model: 'X'.repeat(161), type: 'SUBWOOFER' }, 'overlong model'],
  ])('rejects invalid manually entered names (%s, %s)', row => {
    expect(() => assertCatalogEquipment(catalogs, { audioComponents: [row] })).toThrow(BadRequestException);
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

  it('lets a former imported model be edited as manual text without a catalog ID', () => {
    const legacy = { brand: 'Legacy SPL', model: 'Old sub', type: 'SUBWOOFER', direction: 'SUB', quantity: 2 };
    expect(() => assertCatalogEquipment(catalogs, { audioComponents: [legacy, legacy] },
      { audioComponents: [legacy] })).not.toThrow();
    expect(() => assertCatalogEquipment(catalogs, { audioComponents: [{ ...legacy, quantity: 3 }] },
      { audioComponents: [legacy] })).not.toThrow();
    expect(() => assertCatalogEquipment(catalogs, { audioComponents: [{ ...legacy, type: 'MIDRANGE' }] },
      { audioComponents: [legacy] })).not.toThrow();
    expect(() => assertCatalogEquipment(catalogs, { audioComponents: [{ ...legacy, catalogEntryId: ampId }] },
      { audioComponents: [legacy] })).toThrow(BadRequestException, 'unrelated IDs remain forbidden');
  });

  it('retains an exact retired catalog reference without allowing ID stripping or retagging', () => {
    const retired = { ...sub, catalogEntryId: '00000000-0000-4000-8000-000000000004',
      brand: 'Deaf Bonce', model: 'Hidden' };
    const previous = { audioComponents: [retired] };
    expect(() => assertCatalogEquipment(catalogs, { audioComponents: [{ ...retired }] }, previous))
      .not.toThrow();
    expect(() => assertCatalogEquipment(catalogs, { audioComponents: [{ ...retired, catalogEntryId: undefined }] }, previous))
      .not.toThrow('removing a retired ID converts the model into manual text');
    expect(() => assertCatalogEquipment(catalogs, { audioComponents: [{ ...retired, quantity: 3 }] }, previous))
      .toThrow(BadRequestException);
    expect(() => assertCatalogEquipment(catalogs, { audioComponents: [{ ...retired, direction: 'FRONT' }] }, previous))
      .toThrow(BadRequestException);
    expect(() => assertCatalogEquipment(catalogs, { audioComponents: [retired, retired] }, previous))
      .toThrow(BadRequestException);
    expect(() => assertCatalogEquipment(catalogs, { audioComponents: [{ ...retired, catalogEntryId: ampId }] }, previous))
      .toThrow(BadRequestException);
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

  it('rejects cross-group type spoofing even with approved catalog identifiers', () => {
    expect(() => assertCatalogEquipment(catalogs, { headUnits: [
      { catalogEntryId: subId, brand: 'Deaf Bonce', model: 'Apocalypse', type: 'SUBWOOFER' },
    ] })).toThrow(BadRequestException);
    expect(() => assertCatalogEquipment(catalogs, { audioComponents: [
      { ...sub, type: 'AMPLIFIER', catalogEntryId: ampId, model: 'AAB-2900' },
    ] })).toThrow(BadRequestException);
    expect(() => assertCatalogEquipment(catalogs, { amplifiers: [
      { catalogEntryId: ampId, brand: 'Deaf Bonce', model: 'AAB-2900', type: 'SUBWOOFER' },
    ] })).toThrow(BadRequestException);
  });

  it('does not require a published catalog to save manual text', () => {
    expect(() => assertCatalogEquipment({}, { audioComponents: [{ ...sub, catalogEntryId: undefined }] })).not.toThrow();
    expect(() => assertCatalogEquipment({}, { audioComponents: [sub] })).toThrow(BadRequestException, 'stale IDs must not be trusted');
    expect(() => assertCatalogEquipment({}, { audioComponents: [] })).not.toThrow();
  });
});
