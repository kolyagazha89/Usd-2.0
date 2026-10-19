import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { jest } from '@jest/globals';
import { ImportsService } from './imports.service';
import { NameNormalizerService } from '../common/names/name-normalizer.service';
const source = JSON.parse(
  readFileSync(join(process.cwd(), 'data/historical-xlsx.json'), 'utf8'),
);
describe('supplied historical XLSX source', () => {
  it('contains all 1068 results from the corrected separate workbook', () => {
    const service: any = new ImportsService(
      {} as any,
      new NameNormalizerService(),
    );
    const results = Object.values(source['USD _ Результаты.xlsx']).flatMap(
      (sheet: any) => service.resultRowsFromSheet(sheet),
    );
    expect(results).toHaveLength(1068);
    expect(source['USD _ Результаты.xlsx'].final_volgograd2025[15][4]).toBe(
      'Korneev Igor',
    );
    expect(source['USD _ Регистрация.xlsx']['Открытие Волгоград'][68][1]).toBe(
      'Кононов Сергей',
    );
    // The new GitHub results workbook is the source of truth, not the old
    // embedded 1069-row snapshot that still included sticker 105.
    const final2025 = source['USD _ Результаты.xlsx'].final_volgograd2025;
    const bassmarket = final2025.filter((row: unknown[]) =>
      /^(?:bass\s*market)$/i.test(String(row?.[4] ?? '')));
    expect(bassmarket).toHaveLength(2);
    expect(bassmarket.every((row: unknown[]) => row[2] === 157)).toBe(true);
    expect(source['USD _ Результаты.xlsx'].astraxan[25][4]).toBe('Al-tamimi Ruslan');
  });
  it('uses corrected Registration names to find the helper car and vibration', () => {
    const service: any = new ImportsService(
      {} as any,
      new NameNormalizerService(),
    );
    const helpers = service.rowsFromSheet(
      source['USD _ Регистрация.xlsx']['Открытие Волгоград'],
    );
    const index = service.buildRegistrationParticipantIndex(helpers);
    const match = service.findRegistrationParticipant('Kononov Sergey', index);
    expect(match.status).toBe('MATCHED');
    expect(match.matches[0].rawName).toBe('Кононов Сергей');
    expect(match.matches[0].car.vibrationIsolation).toBeTruthy();
  });
  it('records the exact supplied workbook hashes', () => {
    expect(source._source?.workbooks).toHaveLength(2);
    for (const workbook of source._source.workbooks) {
      const bytes = readFileSync(join(process.cwd(), '..', workbook.file));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        workbook.sha256,
      );
    }
  });
  it('keeps every archive job results-only, including the sheet with no Results', async () => {
    const db: any = {
      season: { findUnique: jest.fn(async () => ({ id: 'season' })) },
      stage: {
        findUnique: jest.fn(async ({ where }: any) => ({
          id: 'stage-' + where.seasonId_stageNumber.stageNumber,
          name: 'Archive',
        })),
        update: jest.fn(async ({ where, data }: any) => ({
          id: where.id,
          ...data,
        })),
      },
      importJob: {
        findMany: jest.fn(async () => []),
        update: jest.fn(async () => ({})),
      },
      class: { findMany: jest.fn(async () => []) },
    };
    const service = new ImportsService(db, new NameNormalizerService());
    const preview = jest
      .spyOn(service, 'previewStage')
      .mockImplementation(
        async () => ({ importJobId: 'job', warnings: [] }) as any,
      );
    await service.prepareHistoricalXlsxImport({} as any);
    expect(preview).toHaveBeenCalledTimes(11);
    const calls = preview.mock.calls.map(([body]) => body);
    expect(calls.every((body) => body.historicalResults === true)).toBe(true);
    expect(calls.find((body) => body.stageId === 'stage-11')).toMatchObject({
      historicalResults: true,
      results: [],
    });
    expect(
      db.importJob.update.mock.calls.every(
        ([args]: any) => args.data.metadata.historicalResults === true,
      ),
    ).toBe(true);
    expect(
      db.importJob.update.mock.calls[0][0].data.metadata.sourceWorkbooks,
    ).toEqual(source._source.workbooks);
  });
});

describe('archive commit boundaries', () => {
  function setup(
    historicalResults: boolean,
    source = 'HISTORICAL_XLSX',
    status = 'WARNING',
  ) {
    const tx: any = {
      $queryRaw: jest.fn(async () => []),
      participant: { create: jest.fn() },
      registration: { create: jest.fn() },
      stage: { update: jest.fn(async () => ({})) },
      importRow: { update: jest.fn() },
      importJob: {
        findUnique: jest.fn(async () => ({
          id: 'job',
          stageId: 'stage',
          status: 'DRAFT',
          metadata: { source, historicalResults },
          rows: [
            {
              id: 'helper',
              type: 'REGISTRATION',
              rowNumber: 1,
              status,
              rawData: { 'Фамилия и имя': 'Петров Иван' },
              normalizedData: {},
              resolution: null,
            },
          ],
        })),
        update: jest.fn(async () => ({})),
      },
    };
    const service = new ImportsService(
      { $transaction: async (fn: any) => fn(tx) } as any,
      new NameNormalizerService(),
    );
    return { service, tx };
  }
  it('rejects an old archive draft that used ordinary registration mode', async () => {
    const { service, tx } = setup(false);
    await expect(service.commitImport('job')).rejects.toThrow(
      'подготовьте архив заново',
    );
    expect(tx.participant.create).not.toHaveBeenCalled();
    expect(tx.importJob.update).not.toHaveBeenCalled();
  });
  it('does not require resolving helper-only warnings or publish an empty Results set', async () => {
    const { service, tx } = setup(true);
    await expect(service.commitImport('job')).resolves.toMatchObject({
      rows: [],
      historicalResults: true,
    });
    expect(tx.participant.create).not.toHaveBeenCalled();
    expect(tx.registration.create).not.toHaveBeenCalled();
    expect(tx.importRow.update).not.toHaveBeenCalled();
    expect(tx.stage.update).not.toHaveBeenCalled();
  });
  it('still blocks an unresolved registration in a normal import', async () => {
    const { service, tx } = setup(false, 'PREVIEW');
    await expect(service.commitImport('job')).rejects.toThrow(
      'нерешённые строки',
    );
    expect(tx.importJob.update).not.toHaveBeenCalled();
  });
});
