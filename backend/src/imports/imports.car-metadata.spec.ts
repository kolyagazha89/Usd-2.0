import { jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ImportsService } from './imports.service';
import { NameNormalizerService } from '../common/names/name-normalizer.service';
const service = (db: any = {}) =>
  new ImportsService(db, new NameNormalizerService()) as any;
const classes = [{ class: { id: 'coffin', name: 'Coffin', unit: 'DB' } }];
const helpers = [
  {
    'Фамилия и имя': 'Войтов Владимир',
    'Номер участника': 36,
    'Модель автомобиля': 'Лада калина',
    'Номер автомобиля': 'К218СВ134',
    Виброизоляция: 'ComfortMat',
  },
];
const raw = {
  ФИО: 'Vasilenko Kseniya',
  Номер: 36,
  Класс: 'Coffin',
  Результат: 163.6,
};
describe('historical car provenance', () => {
  it('never borrows Voitov car or participant name for Vasilenko from their shared sticker', async () => {
    const sut = service({
      registration: { findUnique: jest.fn(async () => null) },
    });
    const result = await sut.previewResultRow(
      raw,
      1,
      new Map(),
      sut.buildRegistrationParticipantIndex(helpers),
      classes,
      'stage',
      true,
    );
    expect(result.registration.matchType).toBe('NUMBER');
    expect(result.car).toEqual({
      model: '',
      plateNumber: '',
      vibrationIsolation: null,
    });
    expect(result.participant.normalizedName).toBe(
      sut.normalizePersonName(raw['ФИО']),
    );
    expect(result.participant.source).toBe('DATABASE');
    expect(result.participantNumber).toBe(36);
  });
  it('still uses a uniquely name-matched car even when the sticker differs', async () => {
    const sut = service({
      registration: { findUnique: jest.fn(async () => null) },
    });
    const result = await sut.previewResultRow(
      { ...raw, ФИО: 'Voitov Vladimir', Номер: 99 },
      1,
      new Map(),
      sut.buildRegistrationParticipantIndex(helpers),
      classes,
      'stage',
      true,
    );
    expect(result.car).toEqual({
      model: 'Лада калина',
      plateNumber: 'К218СВ134',
      vibrationIsolation: 'ComfortMat',
    });
    expect(result.participantNumber).toBe(99);
  });
  it('keeps car data explicitly present in Results instead of borrowing the number-only helper', async () => {
    const sut = service({
      registration: { findUnique: jest.fn(async () => null) },
    });
    const result = await sut.previewResultRow(
      { ...raw, Модель: 'Own car', 'Гос. номер': 'А123АА34' },
      1,
      new Map(),
      sut.buildRegistrationParticipantIndex(helpers),
      classes,
      'stage',
      true,
    );
    expect(result.car).toEqual({
      model: 'Own car',
      plateNumber: 'А123АА34',
      vibrationIsolation: null,
    });
  });
  it('preserves normal-import number matching', async () => {
    const sut = service({
      registration: { findUnique: jest.fn(async () => null) },
    });
    const result = await sut.previewResultRow(
      raw,
      1,
      new Map(),
      sut.buildRegistrationParticipantIndex(helpers),
      classes,
      'stage',
      false,
    );
    expect(result.car.model).toBe('Лада калина');
  });
  it('reproduces the source collision from the real corrected workbook', async () => {
    const source = JSON.parse(
      readFileSync(join(process.cwd(), 'data/historical-xlsx.json'), 'utf8'),
    );
    const sut = service({
      registration: { findUnique: jest.fn(async () => null) },
    });
    const rows = sut.rowsFromSheet(
      source['USD _ Регистрация.xlsx']['Открытие Волгоград'],
    );
    const result = await sut.previewResultRow(
      raw,
      1,
      new Map(),
      sut.buildRegistrationParticipantIndex(rows),
      classes,
      'stage',
      true,
    );
    expect(result.car.plateNumber).toBe('');
    expect(result.car.model).toBe('');
  });
  it('rejects a stale historical preview that already borrowed a numbered helper car', async () => {
    const tx: any = {
      $queryRaw: jest.fn(async () => []),
      participant: { create: jest.fn() },
      importJob: {
        findUnique: jest.fn(async () => ({
          id: 'job',
          stageId: 'stage',
          status: 'DRAFT',
          metadata: { historicalResults: true },
          rows: [
            {
              id: 'row',
              type: 'RESULT',
              rowNumber: 1,
              status: 'READY',
              rawData: raw,
              normalizedData: {
                registration: { matchType: 'NUMBER' },
                car: { model: 'Лада калина', plateNumber: 'К218СВ134' },
              },
              resolution: null,
            },
          ],
        })),
        update: jest.fn(),
      },
    };
    const sut = service({ $transaction: async (fn: any) => fn(tx) });
    await expect(sut.commitImport('job')).rejects.toThrow(
      'сопоставление автомобилей',
    );
    expect(tx.participant.create).not.toHaveBeenCalled();
    expect(tx.importJob.update).not.toHaveBeenCalled();
  });
});
describe('imported car identity', () => {
  const existing = {
    id: 'old-car',
    participantId: 'person',
    model: 'Lada Priora',
    registrationNumber: 'А111АА34',
    isActive: true,
  };
  function setup() {
    const tx: any = {
      car: {
        findMany: jest.fn(async () => [existing]),
        findFirst: jest.fn(async () => existing),
        create: jest.fn(async () => ({ id: 'new-car' })),
        update: jest.fn(),
      },
    };
    return { tx, sut: service() };
  }
  it('does not merge same-model cars when a different plate is supplied', async () => {
    const { tx, sut } = setup();
    await expect(
      sut.getOrCreateImportCar(tx, 'person', {
        model: 'Lada Priora',
        registrationNumber: 'А222АА34',
      }),
    ).resolves.toBe('new-car');
    expect(tx.car.findFirst).not.toHaveBeenCalled();
    expect(tx.car.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ registrationNumber: 'А222АА34' }),
    });
  });
  it('still reuses the same plate across whitespace and Latin lookalikes', async () => {
    const { tx, sut } = setup();
    await expect(
      sut.getOrCreateImportCar(tx, 'person', {
        model: 'Lada Priora',
        registrationNumber: 'A111AA|34',
      }),
    ).resolves.toBe('old-car');
    expect(tx.car.create).not.toHaveBeenCalled();
  });
  it('preserves the model fallback when no plate exists in the source', async () => {
    const { tx, sut } = setup();
    await expect(
      sut.getOrCreateImportCar(tx, 'person', { model: 'Lada Priora' }),
    ).resolves.toBe('old-car');
    expect(tx.car.create).not.toHaveBeenCalled();
  });
});

describe('confirmed final configuration stays separate during reimport',()=>{
 it('never reuses or mutates a participant-confirmed version even with the same vibration',async()=>{
  const tx:any={carConfiguration:{findFirst:jest.fn(async()=>({id:'config',currentVersion:2})),update:jest.fn(async()=>({id:'config',currentVersion:3}))},
   carConfigurationVersion:{findFirst:jest.fn(async()=>({id:'confirmed',version:2,vibrationIsolation:'STP',historicalConfirmations:[{id:'confirmation'}]})),create:jest.fn(async()=>({id:'archive-next',version:3})),update:jest.fn()},registration:{count:jest.fn()}};
  const service:any=new ImportsService({} as any,new NameNormalizerService());
  jest.spyOn(service,'importVibrationBrand').mockResolvedValue('STP');
  const result=await service.ensureLegacyImportConfiguration(tx,'car','STP');
  expect(result.version.id).toBe('archive-next');expect(tx.carConfigurationVersion.update).not.toHaveBeenCalled();
 });
});
