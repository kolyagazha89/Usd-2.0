import 'dotenv/config';

import fs from 'node:fs';
import path from 'node:path';

import { PrismaService } from '../prisma/prisma.service';
import { NameNormalizerService } from '../common/names/name-normalizer.service';
import { ImportsService } from '../imports/imports.service';

type Row = Record<string, unknown>;

const SOURCE = 'HISTORICAL_XLSX_2026_10_06';

const stageSpecs = [
  { year: 2026, number: 3, name: 'Открытие Волгоград', city: 'Волгоград', date: '2026-05-16T12:00:00.000Z' },
  { year: 2026, number: 4, name: 'Астрахань', city: 'Астрахань', date: '2026-05-23T12:00:00.000Z' },
  { year: 2026, number: 5, name: 'Ижевск', city: 'Ижевск', date: '2026-05-30T12:00:00.000Z' },
  { year: 2026, number: 6, name: 'Липецк', city: 'Липецк', date: '2026-06-20T12:00:00.000Z' },
  { year: 2026, number: 7, name: 'Орел', city: 'Орел', date: '2026-07-04T12:00:00.000Z' },
  { year: 2026, number: 8, name: 'Смоленск', city: 'Смоленск', date: '2026-07-11T12:00:00.000Z' },
  { year: 2026, number: 9, name: 'Ростов-на-Дону', city: 'Ростов-на-Дону', date: '2026-07-19T12:00:00.000Z' },
  { year: 2026, number: 10, name: 'Самара', city: 'Самара', date: '2026-08-15T12:00:00.000Z' },
  { year: 2026, number: 11, name: 'Ростов-на-Дону — 05.09', city: 'Ростов-на-Дону', date: '2026-09-05T12:00:00.000Z' },
  { year: 2026, number: 12, name: 'Финал Волгоград', city: 'Волгоград', date: '2026-09-12T12:00:00.000Z' },
  { year: 2025, number: 1, name: 'Финал Волгоград 2025', city: 'Волгоград', date: '2025-09-13T12:00:00.000Z' },
] as const;

const registrationStageMap: Record<string, number> = {
  'Открытие Волгоград': 3,
  'Астрахань': 4,
  'Ижевск': 5,
  'Липецк': 6,
  'Орел': 7,
  'Смоленск': 8,
  'Ростов': 9,
  'Самара': 10,
  'Ростов 05.09': 11,
  'финал Волгоград': 12,
};

const resultStageMap: Record<string, number> = {
  open_volgograd2026: 3,
  astraxan: 4,
  astrakhан: 4,
  ijevsk: 5,
  lipetsk: 6,
  orel: 7,
  smolensk: 8,
  'rostov-on-don': 9,
  samara: 10,
  final_volg2026: 12,
  final_volgograd2025: 1,
};

const classDefs = [
  ['SPL', 'LIMITED_2_0', 'Limited 2.0', 'DB'],
  ['SPL', '1X2', '1x2', 'DB'],
  ['SPL', '2X2', '2x2', 'DB'],
  ['SPL', 'NOLIM', 'NoLim', 'DB'],
  ['SPL', 'SEDAN', 'Sedan', 'DB'],
  ['SPL', 'COFFIN', 'Coffin', 'DB'],
  ['SPL', 'WALL', 'Wall', 'DB'],
  ['SPL', 'WALL_PLUS', 'Wall+', 'DB'],
  ['SPL', 'MAD_X', 'Mad-X', 'DB'],
  ['BFSPL', 'GATE_1_6', 'Gate 1-6', 'DB'],
  ['BFSPL', 'WICKET_6_10', 'Wicket 6-10', 'DB'],
  ['BFSPL', 'WICKET_10_PLUS', 'Wicket 10+', 'DB'],
  ['BDWSPL', 'BDW', 'BDW', 'DB'],
  ['BDWSPL', 'BDW_EX', 'BDW Ex', 'DB'],
  ['BassRace', 'BASSRACE_129_9', 'BassRace 129.9', 'DB'],
  ['BassRace', 'BASSRACE_139_9', 'BassRace 139.9', 'DB'],
  ['BassRace', 'BASSRACE_149_9', 'BassRace 149.9', 'DB'],
  ['BassRace', 'BASSRACE_159_9', 'BassRace 159.9', 'DB'],
  ['Hurrican', 'STORM_WALL', 'Storm Wall', 'MPS'],
] as const;

function loadSource() {
  const file = path.join(__dirname, 'data', 'historical-xlsx.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, Record<string, unknown[][]>>;
}

function rowsFromSheet(sheet: unknown[][], headerCount: number): Row[] {
  if (!sheet?.length) return [];
  const headers = sheet[0].slice(0, headerCount).map((v) => String(v ?? '').trim());
  return sheet.slice(1)
    .filter((raw) => raw.some((v) => v !== null && v !== undefined && String(v).trim() !== ''))
    .map((raw) => Object.fromEntries(headers.map((h, i) => [h, raw[i] ?? null])));
}

function resultRows(sheet: unknown[][]): Row[] {
  const rows = rowsFromSheet(sheet, 5);
  let currentClass: string | null = null;
  for (const row of rows) {
    const cls = String(row['Класс'] ?? '').trim();
    if (cls) currentClass = cls;
    row['Класс'] = currentClass;
  }
  return rows;
}

function toNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

async function main() {
  if (process.env.PREPARE_HISTORICAL_IMPORT !== '1') {
    console.log('PREPARE_HISTORICAL_IMPORT != 1 — nothing to do.');
    return;
  }

  const source = loadSource();
  const prisma = new PrismaService();
  const normalizer = new NameNormalizerService();
  const imports = new ImportsService(prisma, normalizer);

  await prisma.$connect();

  try {
    const season2026 = await prisma.season.findUnique({ where: { year: 2026 } });
    if (!season2026) throw new Error('Сезон 2026 не найден');

    const season2025 = await prisma.season.upsert({
      where: { year: 2025 },
      update: { name: 'USD 2025', isActive: false },
      create: { year: 2025, name: 'USD 2025', status: 'ARCHIVED', isActive: false },
    });

    const seasons = new Map<number, string>([
      [2026, season2026.id],
      [2025, season2025.id],
    ]);

    const stages = new Map<string, string>();

    for (const spec of stageSpecs) {
      const seasonId = seasons.get(spec.year)!;
      const stage = await prisma.stage.upsert({
        where: { seasonId_stageNumber: { seasonId, stageNumber: spec.number } },
        update: {
          name: spec.name,
          city: spec.city,
          date: new Date(spec.date),
          status: 'COMPLETED',
          registrationOpen: false,
          isDeleted: false,
        },
        create: {
          seasonId,
          stageNumber: spec.number,
          name: spec.name,
          city: spec.city,
          date: new Date(spec.date),
          status: 'COMPLETED',
          registrationOpen: false,
          isDeleted: false,
        },
      });
      stages.set(`${spec.year}:${spec.number}`, stage.id);
    }

    const directionIds = new Map<string, string>();
    for (const [directionName] of classDefs) {
      if (directionIds.has(directionName)) continue;
      const existing = await prisma.direction.findFirst({ where: { name: directionName } });
      const direction = existing ?? await prisma.direction.create({ data: { name: directionName, sortOrder: directionIds.size + 1, isActive: true } });
      directionIds.set(directionName, direction.id);
    }

    const classIds = new Map<string, string>();
    for (const [directionName, code, name, unit] of classDefs) {
      const cls = await prisma.class.upsert({
        where: { code },
        update: { directionId: directionIds.get(directionName)!, name, unit: unit as any, isActive: true },
        create: { directionId: directionIds.get(directionName)!, code, name, unit: unit as any, isActive: true },
      });
      classIds.set(name.toLowerCase(), cls.id);
    }

    for (const spec of stageSpecs) {
      const stageId = stages.get(`${spec.year}:${spec.number}`)!;
      for (const [, code, name] of classDefs) {
        await prisma.stageClass.upsert({
          where: { stageId_classId: { stageId, classId: classIds.get(name.toLowerCase())! } },
          update: { isActive: true },
          create: { stageId, classId: classIds.get(name.toLowerCase())!, isActive: true },
        });
      }

      const oldJobs = await prisma.importJob.findMany({
        where: { stageId, status: 'DRAFT' },
        select: { id: true, metadata: true },
      });
      for (const job of oldJobs) {
        if ((job.metadata as any)?.source === SOURCE) {
          await prisma.importJob.delete({ where: { id: job.id } });
        }
      }
    }

    const registrations = source['USD _ Регистрация.xlsx'];
    const results = source['USD _ Результаты.xlsx'];

    const stageByRegSheet = new Map<number, Row[]>();
    for (const [sheetName, stageNumber] of Object.entries(registrationStageMap)) {
      const sheet = registrations[sheetName];
      if (!sheet) throw new Error(`Не найден лист регистрации: ${sheetName}`);
      stageByRegSheet.set(stageNumber, rowsFromSheet(sheet, 12));
    }

    for (const [stageNumber, rows] of stageByRegSheet) {
      const stageId = stages.get(`2026:${stageNumber}`)!;
      const job = await imports.previewStage(
        {
          stageId,
          registrations: rows,
          results: [],
          historicalResults: false,
        },
      );
      const importJob = (job as any).importJob;
      await prisma.importJob.update({
        where: { id: importJob.id },
        data: {
          metadata: {
            ...(importJob.metadata ?? {}),
            source: SOURCE,
            sourceWorkbook: 'USD _ Регистрация.xlsx',
            sourceSheet: [...Object.entries(registrationStageMap)].find(([, n]) => n === stageNumber)?.[0] ?? null,
          },
        },
      });
      console.log(`REGISTRATION stage ${stageNumber}: ${rows.length} rows -> ${importJob.id}`);
    }

    for (const [sheetName, stageNumber] of Object.entries(resultStageMap)) {
      const sheet = results[sheetName];
      if (!sheet) throw new Error(`Не найден лист результатов: ${sheetName}`);
      const resultData = resultRows(sheet);
      const stageId = stages.get(`${sheetName === 'final_volgograd2025' ? 2025 : 2026}:${stageNumber}`)!;
      const auxiliary = sheetName === 'final_volgograd2025'
        ? []
        : stageByRegSheet.get(stageNumber) ?? [];
      const job = await imports.previewStage({
        stageId,
        registrations: auxiliary,
        results: resultData,
        historicalResults: true,
      });
      const importJob = (job as any).importJob;
      await prisma.importJob.update({
        where: { id: importJob.id },
        data: {
          metadata: {
            ...(importJob.metadata ?? {}),
            source: SOURCE,
            sourceWorkbook: 'USD _ Результаты.xlsx',
            sourceSheet: sheetName,
          },
        },
      });
      console.log(`RESULT stage ${stageNumber} / ${sheetName}: ${resultData.length} rows -> ${importJob.id}`);
    }

    console.log('HISTORICAL IMPORT PREPARED: DRAFT jobs created; nothing committed.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
