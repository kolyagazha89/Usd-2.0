import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isValidInternationalPhone, isValidRegistrationPlate } from '../participants/profile-validation';
import { NameNormalizerService } from '../common/names/name-normalizer.service';

type Row = Record<string, any>;

function clean(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u00A0\u202F]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
function key(value: unknown): string {
  return clean(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}
function plateKey(country: unknown, value: unknown): string {
  const normalizedCountry = String(country ?? '').toUpperCase();
  let plate = clean(value).toLocaleUpperCase('ru-RU');
  if (normalizedCountry === 'RU') {
    const lookalikes: Record<string, string> = {
      A: 'А', B: 'В', E: 'Е', K: 'К', M: 'М',
      H: 'Н', O: 'О', P: 'Р', C: 'С', T: 'Т',
      Y: 'У', X: 'Х',
    };
    plate = [...plate].map(ch => /[|\\s.\\-_/\\\\]/.test(ch) ? '' : (lookalikes[ch] ?? ch)).join('');
  }
  return normalizedCountry + ':' + plate.replace(/[^\\p{L}\\p{N}]/gu, '');
}
function phoneKey(value: unknown): string {
  return clean(value).replace(/\D/g, '');
}
function groupBy<T>(items: T[], getKey: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const groupKey = getKey(item);
    if (!groupKey) continue;
    const group = groups.get(groupKey) ?? [];
    group.push(item);
    groups.set(groupKey, group);
  }
  return [...groups.values()].filter(group => group.length > 1);
}
function distinctValues(items: unknown[]): string[] {
  return [...new Set(items.map(clean).filter(Boolean))];
}
function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length < 4 ? '***' : '***' + digits.slice(-4);
}

@Injectable()
export class NormalizationDryRunService {
  constructor(private readonly prisma: PrismaService, private readonly nameNormalizer: NameNormalizerService) {}

  async run() {
    const [participants, cars, users, directions, importRows, importRowCount] = await Promise.all([
      this.prisma.participant.findMany({
        select: { id: true, firstName: true, lastName: true, middleName: true, team: true, city: true, phone: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      this.prisma.car.findMany({
        select: { id: true, participantId: true, brand: true, model: true, registrationNumber: true, registrationCountry: true,
          participant: { select: { firstName: true, lastName: true } } },
        orderBy: [{ registrationCountry: 'asc' }, { registrationNumber: 'asc' }],
      }),
      this.prisma.user.findMany({ select: { id: true, email: true, role: true }, orderBy: { email: 'asc' } }),
      this.prisma.direction.findMany({ select: { id: true, name: true, classes: { select: { id: true, code: true, name: true } } } }),
      this.prisma.importRow.findMany({
        select: { id: true, importJobId: true, type: true, rowNumber: true, status: true, rawData: true, normalizedData: true, warnings: true },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      }),
      this.prisma.importRow.count(),
    ]) as [Row[], Row[], Row[], Row[], Row[], number];

    const duplicatePeople = groupBy(participants, p => [key(this.nameNormalizer.normalize(p.lastName)), key(this.nameNormalizer.normalize(p.firstName)), key(this.nameNormalizer.normalize(p.middleName))].join('|'))
      .filter(group => [group[0].lastName, group[0].firstName].every(Boolean))
      .map(group => ({
        normalizedName: [clean(group[0].lastName), clean(group[0].firstName), clean(group[0].middleName)].filter(Boolean).join(' '),
        participants: group.map(p => ({ id: p.id, name: [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' '), phone: p.phone ? maskPhone(String(p.phone)) : null, team: p.team, city: p.city })),
      }));

    const phoneGroups = groupBy(participants.filter(p => phoneKey(p.phone).length >= 8), p => phoneKey(p.phone))
      .map(group => ({ phone: maskPhone(String(group[0].phone)), participants: group.map(p => ({ id: p.id, name: [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' ') })) }));
    const invalidPhones = participants.filter(p => p.phone && !isValidInternationalPhone(String(p.phone)))
      .map(p => ({ participantId: p.id, name: [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' '), phone: maskPhone(String(p.phone)), reason: 'Invalid international phone format' }));

    const plateGroups = groupBy(cars.filter(c => !/^(автомобиль не указан|не указан|unknown|n\/a|-)$/i.test(clean(c.registrationNumber))),
      c => plateKey(c.registrationCountry, c.registrationNumber))
      .map(group => ({ key: plateKey(group[0].registrationCountry, group[0].registrationNumber), cars: group.map(c => ({ id: c.id, participantId: c.participantId, participant: [c.participant?.lastName, c.participant?.firstName].filter(Boolean).join(' '), brand: c.brand, model: c.model, country: c.registrationCountry, plate: c.registrationNumber })) }));
    const brandVariants = groupBy(cars.filter(c => clean(c.brand)), c => key(this.nameNormalizer.normalize(c.brand)))
      .map(group => ({ normalized: key(this.nameNormalizer.normalize(group[0].brand)), variants: distinctValues(group.map(c => c.brand)), cars: group.map(c => ({ id: c.id, participantId: c.participantId, brand: c.brand, model: c.model, country: c.registrationCountry, plate: c.registrationNumber })) }))
      .filter(group => group.variants.length > 1);
    const modelVariants = groupBy(cars.filter(c => clean(c.model)), c => key(this.nameNormalizer.normalize(c.model)))
      .map(group => ({ normalized: key(this.nameNormalizer.normalize(group[0].model)), variants: distinctValues(group.map(c => c.model)), cars: group.map(c => ({ id: c.id, participantId: c.participantId, brand: c.brand, model: c.model, country: c.registrationCountry, plate: c.registrationNumber })) }))
      .filter(group => group.variants.length > 1);

    const invalidPlates = cars.filter(c => !/^(автомобиль не указан|не указан|unknown|n\/a|-)$/i.test(clean(c.registrationNumber)) && !isValidRegistrationPlate(String(c.registrationCountry), String(c.registrationNumber)))
      .map(c => ({ carId: c.id, participantId: c.participantId, participant: [c.participant?.lastName, c.participant?.firstName].filter(Boolean).join(' '), country: c.registrationCountry, plate: c.registrationNumber }));

    const variants = (field: 'team' | 'city') => {
      const entries = participants.map(p => ({ value: clean(p[field]), participantId: p.id, name: [p.lastName, p.firstName].filter(Boolean).join(' ') })).filter(x => x.value);
      return groupBy(entries, x => key(x.value))
        .map(group => ({ normalized: key(group[0].value), variants: distinctValues(group.map(x => x.value)), participants: group.map(x => ({ id: x.participantId, name: x.name, value: x.value })) }))
        .filter(group => group.variants.length > 1);
    };

    const invalidEmails = users.filter(u => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean(u.email)))
      .map(u => ({ userId: u.id, email: u.email, role: u.role, reason: 'Invalid email format' }));
    const emailVariants = groupBy(users.filter(u => clean(u.email)), u => key(u.email))
      .map(group => ({ normalizedEmail: key(group[0].email), accounts: group.map(u => ({ id: u.id, email: u.email, role: u.role })) }))
      .filter(group => new Set(group.accounts.map(a => a.email)).size > 1);

    const directionDuplicates = groupBy(directions, d => key(d.name)).map(group => ({
      normalized: key(group[0].name), directions: group.map(d => ({ id: d.id, name: d.name, classCount: d.classes.length })),
    })).filter(group => new Set(group.directions.map(d => d.name)).size > 1 || group.directions.length > 1);
    const classEntries = directions.flatMap(d => d.classes.map((c: Row) => ({ ...c, directionId: d.id, directionName: d.name })));
    const classDuplicates = groupBy(classEntries, c => key(c.name)).map(group => ({
      normalized: key(group[0].name), classes: group.map(c => ({ id: c.id, code: c.code, name: c.name, directionId: c.directionId, directionName: c.directionName })),
    })).filter(group => group.classes.length > 1);

    const unresolvedImports = importRows.filter(row => row.status !== 'COMMITTED' && row.status !== 'RESOLVED')
      .map(row => ({ id: row.id, importJobId: row.importJobId, type: row.type, rowNumber: row.rowNumber, status: row.status, warnings: row.warnings }));
    const importNameVariants = new Map<string, { variants: Set<string>; rows: Array<{ id: string; importJobId: string; rowNumber: number; status: string }> }>();
    for (const row of importRows) {
      const raw = row.rawData && typeof row.rawData === 'object' ? row.rawData as Row : {};
      const normalized = row.normalizedData && typeof row.normalizedData === 'object' ? row.normalizedData as Row : {};
      const rawName = clean(raw.participantName ?? raw.name ?? raw['Участник'] ?? raw['ФИО'] ?? raw['Фамилия Имя']);
      const normalizedName = clean(normalized.participantName ?? normalized.name ?? normalized.fullName);
      const display = rawName || normalizedName;
      const k = key(normalizedName || rawName);
      if (!k || !display) continue;
      const group = importNameVariants.get(k) ?? { variants: new Set<string>(), rows: [] };
      group.variants.add(rawName || normalizedName);
      if (normalizedName) group.variants.add(normalizedName);
      group.rows.push({ id: row.id, importJobId: row.importJobId, rowNumber: row.rowNumber, status: row.status });
      importNameVariants.set(k, group);
    }

    return {
      success: true,
      mode: 'DRY_RUN',
      readOnly: true,
      generatedAt: new Date().toISOString(),
      disclaimer: 'Это список кандидатов для проверки, а не решение об объединении. Никакие записи не изменены.',
      coverage: { participants: participants.length, cars: cars.length, users: users.length, directions: directions.length, classes: classEntries.length, importRowsSampled: importRows.length, importRowsTotal: importRowCount, importRowsTruncated: importRowCount > importRows.length },
      summary: {
        duplicatePeopleGroups: duplicatePeople.length,
        duplicatePhoneGroups: phoneGroups.length,
        invalidPhones: invalidPhones.length,
        duplicatePlateGroups: plateGroups.length,
        invalidPlates: invalidPlates.length,
        brandVariantGroups: brandVariants.length,
        modelVariantGroups: modelVariants.length,
        teamVariantGroups: variants('team').length,
        cityVariantGroups: variants('city').length,
        normalizedEmailCollisionGroups: emailVariants.length,
        invalidEmails: invalidEmails.length,
        directionDuplicateGroups: directionDuplicates.length,
        classDuplicateGroups: classDuplicates.length,
        unresolvedImportRows: unresolvedImports.length,
      },
      findings: {
        duplicatePeople: duplicatePeople.slice(0, 200),
        duplicatePhones: phoneGroups.slice(0, 200),
        invalidPhones: invalidPhones.slice(0, 200),
        duplicatePlates: plateGroups.slice(0, 200),
        invalidPlates: invalidPlates.slice(0, 200),
        brandVariants: brandVariants.slice(0, 200),
        modelVariants: modelVariants.slice(0, 200),
        teamVariants: variants('team').slice(0, 200),
        cityVariants: variants('city').slice(0, 200),
        normalizedEmailCollisions: emailVariants.slice(0, 200),
        invalidEmails: invalidEmails.slice(0, 200),
        duplicateDirections: directionDuplicates.slice(0, 200),
        duplicateClasses: classDuplicates.slice(0, 200),
        unresolvedImports: unresolvedImports.slice(0, 200),
        repeatedImportedNameGroups: [...importNameVariants.entries()].filter(([, group]) => group.rows.length > 1).slice(0, 200).map(([normalized, group]) => ({ normalized, variants: [...group.variants], rows: group.rows })),
      },
    };
  }
}
