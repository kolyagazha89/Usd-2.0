import { jest } from '@jest/globals';
import { BassRaceTextImportService } from './bassrace-text-import.service';

describe('BassRace ADMIN paste import', () => {
  const source = 'BassRace\n120.0 To 129.9\n1 129,90 055 Kostrykov Alexandr\n5 129,93 050 Haritonov Danil';
  const stage = { id: 'stage-1', seasonId: 'season-1', status: 'COMPLETED', isDeleted: false };
  const rows = [
    { id: 'reg-1', participantId: 'person-1', participant: { firstName: 'Alexandr', lastName: 'Kostrykov', middleName: null },
      stageInspection: { status: 'PASSED' }, inspection: null,
      classes: [{ id: 'class-reg-1', classId: 'bass-129', number: { number: 55 }, inspection: { status: 'PASSED' }, results: [] }] },
    { id: 'reg-2', participantId: 'person-2', participant: { firstName: 'Danil', lastName: 'Haritonov', middleName: null },
      stageInspection: { status: 'PASSED' }, inspection: null,
      classes: [{ id: 'class-reg-2', classId: 'bass-129', number: { number: 50 }, inspection: { status: 'PASSED' }, results: [] }] },
  ];
  const admin: any = { user: { role: 'ADMIN', sub: 'admin-1' }, ip: '127.0.0.1' };
  let db: any;
  let service: BassRaceTextImportService;

  beforeEach(() => {
    db = {
      stage: { findUnique: jest.fn(async () => ({ ...stage })) },
      stageClass: { findMany: jest.fn(async () => [
        { classId: 'bass-129', isActive: true, class: { id: 'bass-129', name: 'BassRace 129.9', code: 'BASSRACE_129', direction: { name: 'BassRace' } } },
      ]) },
      registration: { findMany: jest.fn(async () => structuredClone(rows)) },
      disqualification: { findMany: jest.fn(async () => []) },
      result: { create: jest.fn(async ({ data }: any) => ({ id: 'result-' + data.registrationClassId })) },
      auditLog: { create: jest.fn(async () => ({ id: 'audit-1' })) },
      $executeRaw: jest.fn(async () => undefined),
    };
    db.$transaction = jest.fn(async (callback: any) => callback(db));
    service = new BassRaceTextImportService(db);
  });

  it('previews by class sticker and preserves printed place when a lower place has higher dB', async () => {
    const preview = await service.preview(stage.id, source);
    expect(preview.canCommit).toBe(true);
    expect(preview.readyCount).toBe(2);
    expect(preview.rows.map(row => ({ id: row.registrationClassId, place: row.place, value: row.value })))
      .toEqual([{ id: 'class-reg-1', place: 1, value: 129.9 }, { id: 'class-reg-2', place: 5, value: 129.93 }]);
    expect(db.result.create).not.toHaveBeenCalled();
  });

  it('atomically writes official places and audit after explicit confirmed preview', async () => {
    const preview = await service.preview(stage.id, source);
    const result = await service.commit(stage.id, source, preview.previewHash, admin);
    expect(result).toMatchObject({ success: true, importedCount: 2, unchangedCount: 0 });
    const writes = db.result.create.mock.calls.map(([args]: any) => args.data);
    expect(writes.map((row: any) => ({ classId: row.registrationClassId, place: row.place, value: row.value })))
      .toEqual([{ classId: 'class-reg-1', place: 1, value: 129.9 }, { classId: 'class-reg-2', place: 5, value: 129.93 }]);
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('rejects changed text after preview and does not write', async () => {
    const preview = await service.preview(stage.id, source);
    await expect(service.commit(stage.id, source.replace('129,93', '129,92'), preview.previewHash, admin))
      .rejects.toThrow('Данные изменились');
    expect(db.result.create).not.toHaveBeenCalled();
  });

  it('blocks imports with unmatched stickers rather than creating fake entrants', async () => {
    db.registration.findMany.mockResolvedValue([structuredClone(rows[0])]);
    const preview = await service.preview(stage.id, source);
    expect(preview.canCommit).toBe(false);
    expect(preview.errors.join(' ')).toContain('Номер не найден');
    await expect(service.commit(stage.id, source, preview.previewHash, admin)).rejects.toThrow('ошибки');
    expect(db.result.create).not.toHaveBeenCalled();
  });

  it('blocks imports if another result has already been entered for that class and number', async () => {
    const withResult = structuredClone(rows);
    withResult[0].classes[0].results.push({ id: 'old', place: 2, value: 129.1, isHistorical: false } as never);
    db.registration.findMany.mockResolvedValue(withResult);
    const preview = await service.preview(stage.id, source);
    expect(preview.canCommit).toBe(false);
    expect(preview.rows[0].issue).toContain('уже существует');
  });

  it('reuses exact existing results without creating duplicates', async () => {
    const withResult = structuredClone(rows);
    withResult[0].classes[0].results.push({ id: 'old', place: 1, value: 129.9, isHistorical: false } as never);
    db.registration.findMany.mockResolvedValue(withResult);
    const preview = await service.preview(stage.id, source);
    expect(preview).toMatchObject({ readyCount: 1, alreadyCount: 1, canCommit: true });
    const result = await service.commit(stage.id, source, preview.previewHash, admin);
    expect(result).toMatchObject({ importedCount: 1, unchangedCount: 1 });
    expect(db.result.create).toHaveBeenCalledTimes(1);
  });

  it('rejects import before stage completion', async () => {
    db.stage.findUnique.mockResolvedValue({ ...stage, status: 'PUBLISHED' });
    await expect(service.preview(stage.id, source)).rejects.toThrow('после завершения этапа');
  });

  it('forbids non-ADMIN commit', async () => {
    await expect(service.commit(stage.id, source, 'a'.repeat(64), {
      user: { role: 'PARTICIPANT', sub: 'judge' }, ip: '127.0.0.1',
    } as any)).rejects.toThrow('только ADMIN');
    expect(db.result.create).not.toHaveBeenCalled();
  });

  it('blocks disqualified and uninspected entries', async () => {
    db.disqualification.findMany.mockResolvedValue([{ participantId: 'person-1' }]);
    const preview = await service.preview(stage.id, source);
    expect(preview.rows[0].issue).toContain('дисквалифицирован');
    expect(preview.canCommit).toBe(false);
  });
});
