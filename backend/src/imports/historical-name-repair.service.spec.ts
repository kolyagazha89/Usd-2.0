import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { NameNormalizerService } from '../common/names/name-normalizer.service';
import { HistoricalNameRepairService } from './historical-name-repair.service';
import { PrismaService } from '../prisma/prisma.service';

function setup() {
  const people: any[] = [
    { id: 'a', lastName: 'Говорухин', firstName: 'Илийа', middleName: null, user: null,
      registrations: [{ id: 'reg-a' }] },
    { id: 'b', lastName: 'Зуборев', firstName: 'Владислав', middleName: null, user: null,
      registrations: [{ id: 'reg-b' }] },
    { id: 'c', lastName: 'Иванов', firstName: 'Иван', middleName: null, user: { id: 'user-c' },
      registrations: [] },
    { id: 'd', lastName: 'Антоха', firstName: 'Сф', middleName: null, user: null,
      registrations: [] },
  ];
  const db: any = {
    participant: {
      findMany: jest.fn(async () => people),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
    },
    auditLog: { create: jest.fn(async () => ({ id: 'audit' })) },
    $queryRaw: jest.fn(async () => []),
  };
  db.$transaction = jest.fn(async (callback: (tx: any) => Promise<any>) => callback(db));
  const service = new HistoricalNameRepairService(db as PrismaService, new NameNormalizerService());
  return { db, service, people };
}

describe('HistoricalNameRepairService', () => {
  const oldHistorical = process.env.ALLOW_HISTORICAL_IMPORT_RESET;
  const oldFlag = process.env.ALLOW_TEST_NAME_REPAIR;
  afterEach(() => {
    if (oldHistorical === undefined) delete process.env.ALLOW_HISTORICAL_IMPORT_RESET;
    else process.env.ALLOW_HISTORICAL_IMPORT_RESET = oldHistorical;
    if (oldFlag === undefined) delete process.env.ALLOW_TEST_NAME_REPAIR;
    else process.env.ALLOW_TEST_NAME_REPAIR = oldFlag;
  });

  it('previews known spelling corrections while leaving legitimate surnames and fake people distinct', async () => {
    const { db, service } = setup();
    const preview = await service.preview();
    expect(preview.readOnly).toBe(true);
    expect(preview.counts).toMatchObject({
      totalParticipants: 4, safeCorrections: 1, requiresReview: 1, accountLinked: 1,
    });
    expect(preview.examples.safe[0]).toEqual({
      before: 'Говорухин Илийа', after: 'Говорухин Илья',
    });
    expect(preview.examples.review.map((r) => r.name).sort()).toEqual([
      'Антоха Сф',
    ]);
    expect(db.participant.update).not.toHaveBeenCalled();
  });

  it('requires both temporary switches and exact confirmation', async () => {
    const { db, service } = setup();
    const preview = await service.preview();
    delete process.env.ALLOW_HISTORICAL_IMPORT_RESET;
    delete process.env.ALLOW_TEST_NAME_REPAIR;
    await expect(service.execute(preview.confirmationRequired, preview.fingerprint, 1))
      .rejects.toThrow(ForbiddenException);
    expect(db.$transaction).not.toHaveBeenCalled();
    process.env.ALLOW_HISTORICAL_IMPORT_RESET = 'true';
    process.env.ALLOW_TEST_NAME_REPAIR = 'true';
    await expect(service.execute('wrong', preview.fingerprint, 1)).rejects.toThrow(BadRequestException);
    await expect(service.execute(preview.confirmationRequired, 'bad', 1)).rejects.toThrow(BadRequestException);
  });

  it('renames only safe unclaimed participants, retaining registration links and other profiles', async () => {
    process.env.ALLOW_HISTORICAL_IMPORT_RESET = 'true';
    process.env.ALLOW_TEST_NAME_REPAIR = 'true';
    const { db, service } = setup();
    const preview = await service.preview();
    const result = await service.execute(preview.confirmationRequired, preview.fingerprint, 1);
    expect(result).toMatchObject({ fixed: 1, skippedForReview: 1 });
    expect(db.participant.update).toHaveBeenCalledTimes(1);
    expect(db.participant.update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { lastName: 'Говорухин', firstName: 'Илья', middleName: null },
    });
    expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'HISTORICAL_TEST_NAME_REPAIR' }),
    }));
  });

  it('rejects a changed DB snapshot before any update', async () => {
    process.env.ALLOW_HISTORICAL_IMPORT_RESET = 'true';
    process.env.ALLOW_TEST_NAME_REPAIR = 'true';
    const { db, service, people } = setup();
    const preview = await service.preview();
    people[0].firstName = 'Другое';
    await expect(service.execute(preview.confirmationRequired, preview.fingerprint, 1))
      .rejects.toThrow(BadRequestException);
    expect(db.participant.update).not.toHaveBeenCalled();
  });

  it('previews a spelling-only repair for Мухарскиы without overwriting distinct Мушарский', async () => {
    const { db, people, service } = setup();
    people.push(
      { id: 'mukhar', lastName: 'Мухарскиы', firstName: 'Игорь', middleName: null,
        user: null, registrations: [{ id: 'reg-mukhar' }] },
      { id: 'mushar', lastName: 'Мушарский', firstName: 'Игорь', middleName: null,
        user: null, registrations: [{ id: 'reg-mushar' }] },
    );
    const preview = await service.preview();
    expect(preview.readOnly).toBe(true);
    expect(preview.examples.safe).toContainEqual({
      before: 'Мухарскиы Игорь',
      after: 'Мухарский Игорь',
    });
    expect(preview.examples.safe).not.toContainEqual({
      before: 'Мухарскиы Игорь',
      after: 'Мушарский Игорь',
    });
    expect(db.participant.update).not.toHaveBeenCalled();
  });

  it('keeps duplicate target FIO and linked user profiles out of automatic corrections', async () => {
    const { db, service, people } = setup();
    people.push({
      id: 'e', lastName: 'Говорухин', firstName: 'Илья', middleName: null, user: null,
      registrations: [],
    });
    people[2].firstName = 'Илийа';
    const p = await service.preview();
    expect(p.counts.safeCorrections).toBe(0);
    expect(p.examples.review.some((item) =>
      item.reason.includes('Совпадает с другой карточкой'))).toBe(true);
    expect(db.participant.update).not.toHaveBeenCalled();
  });

  it('proposes all verified old Y-transliteration fixes but does not merge duplicate people', async () => {
    const { db, service, people } = setup();
    for (const [i, surname, given] of [
      ['bad-1', 'Блажко', 'Ноколаы'],
      ['bad-2', 'Голубняк', 'Анатоолы'],
      ['bad-3', 'Жидков', 'Йрыи'],
      ['bad-4', 'Кудряшов', 'Эгор'],
      ['bad-5', 'Мирзабекян', 'Лавренты'],
      ['bad-6', 'Мушарскиы', 'Игорь'],
      ['bad-7', 'Овчинников', 'Сргеы'],
      ['bad-8', 'Сергушин', 'Терентиы'],
      ['bad-9', 'Чаыка', 'Ярослав'],
    ]) {
      people.push({
        id: i, lastName: surname, firstName: given, middleName: null,
        user: null, registrations: [{ id: 'registration-' + i }],
      });
    }
    // An already correct participant creates an identity conflict: the
    // spelling repair must not silently combine two Participant IDs.
    people.push({ id: 'real-sergey', lastName: 'Овчинников', firstName: 'Сергей',
      middleName: null, user: null, registrations: [] });
    // Archival performer title must remain verbatim even with a proposed spelling.
    people.push({ id: 'archive-title', lastName: '34 Sound', firstName: '',
      middleName: null, historicalAlias: '34 Sound', user: null, registrations: [] });
    const preview = await service.preview();
    expect(preview.readOnly).toBe(true);
    expect(preview.counts).toMatchObject({
      safeCorrections: 9, archivalAliasesProtected: 1,
    }); // eight damaged spellings + original Говорухин; Овчинников is blocked
    const changes = new Map(preview.examples.safe.map((v) => [v.before, v.after]));
    expect(changes.get('Блажко Ноколаы')).toBe('Блажко Николай');
    expect(changes.get('Голубняк Анатоолы')).toBe('Голубняк Анатолий');
    expect(changes.get('Мушарскиы Игорь')).toBe('Мушарский Игорь');
    expect(changes.get('Чаыка Ярослав')).toBe('Чайка Ярослав');
    expect(preview.examples.review.some((r) =>
      r.name === 'Овчинников Сргеы' && r.reason.includes('Совпадает'))).toBe(true);
    expect(preview.examples.review.some((r) => r.name === '34 Sound')).toBe(true);
    expect(db.participant.update).not.toHaveBeenCalled();
  });

});
