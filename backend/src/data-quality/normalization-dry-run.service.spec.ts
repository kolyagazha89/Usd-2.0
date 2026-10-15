import { jest } from '@jest/globals';
import { NormalizationDryRunService } from './normalization-dry-run.service';
import { NameNormalizerService } from '../common/names/name-normalizer.service';

describe('NormalizationDryRunService', () => {
  it('reports possible duplicates and invalid data without mutating records', async () => {
    const prisma: any = {
      participant: { findMany: jest.fn().mockResolvedValue([
        { id: 'p1', firstName: 'Иван', lastName: 'Иванов', middleName: null, team: 'Team A', city: 'Тюмень', phone: '+7 (999) 123-45-67' },
        { id: 'p2', firstName: 'Иван', lastName: ' Иванов ', middleName: null, team: ' team  a ', city: 'ТЮМЕНЬ', phone: '+7 (999) 123-45-67' },
        { id: 'p3', firstName: 'Пётр', lastName: 'Петров', middleName: null, team: null, city: null, phone: 'bad-phone' },
        { id: 'p4', firstName: 'Ivan', lastName: 'Ivanov', middleName: null, team: null, city: null, phone: null },
      ]) },
      car: { findMany: jest.fn().mockResolvedValue([
        { id: 'c1', participantId: 'p1', brand: 'Lada', model: 'Vesta', registrationNumber: 'А123ВС72', registrationCountry: 'RU', participant: { firstName: 'Иван', lastName: 'Иванов' } },
        { id: 'c2', participantId: 'p2', brand: 'Лада', model: 'Веста', registrationNumber: 'А123ВС72', registrationCountry: 'RU', participant: { firstName: 'Иван', lastName: 'Иванов' } },
        { id: 'c3', participantId: 'p3', brand: '—', model: '—', registrationNumber: 'автомобиль не указан', registrationCountry: 'RU', participant: { firstName: 'Пётр', lastName: 'Петров' } },
      ]) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1', email: 'Test@example.com', role: 'ADMIN' }, { id: 'u2', email: 'test@EXAMPLE.com', role: 'PARTICIPANT' }, { id: 'u3', email: 'invalid-email', role: 'PARTICIPANT' }]) },
      direction: { findMany: jest.fn().mockResolvedValue([{ id: 'd1', name: 'SPL', classes: [{ id: 'cl1', code: 'SPL1', name: 'Limited 2.0' }] }, { id: 'd2', name: 'spl', classes: [{ id: 'cl2', code: 'SPL2', name: 'Limited 2.0' }] }]) },
      importRow: {
        findMany: jest.fn().mockResolvedValue([{ id: 'i1', importJobId: 'j1', type: 'RESULT', rowNumber: 4, status: 'WARNING', rawData: { participantName: 'Ivan Ivanov' }, normalizedData: { participantName: 'Ivan Ivanov' }, warnings: ['Possible duplicate'] }]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const report = await new NormalizationDryRunService(prisma, new NameNormalizerService()).run();
    expect(report.readOnly).toBe(true);
    expect(report.mode).toBe('DRY_RUN');
    expect(report.summary.duplicatePeopleGroups).toBe(1);
    expect(report.summary.duplicatePlateGroups).toBe(1);
    expect(report.summary.brandVariantGroups).toBe(1);
    expect(report.summary.modelVariantGroups).toBe(1);
    expect(report.summary.invalidPlates).toBe(0);
    expect(report.summary.invalidPhones).toBe(1);
    expect(report.summary.normalizedEmailCollisionGroups).toBe(1);
    expect(report.summary.invalidEmails).toBe(1);
    expect(report.summary.classDuplicateGroups).toBe(1);
    expect(report.summary.unresolvedImportRows).toBe(1);
    expect(report.findings.teamVariants).toHaveLength(1);
    expect(report.findings.cityVariants).toHaveLength(1);
  });
});
