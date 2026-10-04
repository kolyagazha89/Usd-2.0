import 'dotenv/config';

import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

const TEST_PREFIX = 'USD_TEST_';

const participants = [
  { key: 'P1', lastName: 'Петров', firstName: 'Иван', middleName: 'Алексеевич', team: 'Bass Brothers', phone: '+7 900 111-10-01', city: 'Тюмень', birthDate: '1997-04-12', email: 'ivan.petrov.test@example.com' },
  { key: 'P2', lastName: 'Соколов', firstName: 'Алексей', middleName: 'Дмитриевич', team: 'SPL Garage', phone: '+7 900 111-10-02', city: 'Екатеринбург', birthDate: '1994-08-21', email: 'alexey.sokolov.test@example.com' },
  { key: 'P3', lastName: 'Морозов', firstName: 'Денис', middleName: 'Сергеевич', team: 'Tyumen Sound', phone: '+7 900 111-10-03', city: 'Тюмень', birthDate: '1992-02-17', email: 'denis.morozov.test@example.com' },
  { key: 'P4', lastName: 'Кузнецов', firstName: 'Максим', middleName: 'Олегович', team: 'Bass Brothers', phone: '+7 900 111-10-04', city: 'Сургут', birthDate: '1990-11-03', email: 'maxim.kuznetsov.test@example.com' },
  { key: 'P5', lastName: 'Волков', firstName: 'Артём', middleName: 'Игоревич', team: 'Ural SPL', phone: '+7 900 111-10-05', city: 'Челябинск', birthDate: '1998-06-29', email: 'artem.volkov.test@example.com' },
  { key: 'P6', lastName: 'Орлов', firstName: 'Никита', middleName: 'Владимирович', team: 'North Audio', phone: '+7 900 111-10-06', city: 'Тюмень', birthDate: '1996-01-25', email: 'nikita.orlov.test@example.com' },
  { key: 'P7', lastName: 'Фёдоров', firstName: 'Роман', middleName: 'Андреевич', team: 'West Sound', phone: '+7 900 111-10-07', city: 'Курган', birthDate: '1991-09-14', email: 'roman.fedorov.test@example.com' },
  { key: 'P8', lastName: 'Белов', firstName: 'Егор', middleName: 'Максимович', team: 'SPL Garage', phone: '+7 900 111-10-08', city: 'Омск', birthDate: '1999-12-08', email: 'egor.belov.test@example.com' },
];

const cars = [
  { key: 'C1', participant: 'P1', brand: 'Lada', model: 'Kalina', registrationNumber: 'А111АА72', country: 'RU', color: 'Белый' },
  { key: 'C2', participant: 'P2', brand: 'Lada', model: 'Priora', registrationNumber: 'Е222КЕ66', country: 'RU', color: 'Чёрный' },
  { key: 'C3', participant: 'P3', brand: 'Toyota', model: 'Mark II', registrationNumber: 'М333ММ72', country: 'RU', color: 'Серебристый' },
  { key: 'C4', participant: 'P4', brand: 'BMW', model: 'E36', registrationNumber: 'О444ОО86', country: 'RU', color: 'Синий' },
  { key: 'C5', participant: 'P5', brand: 'Lada', model: 'Granta', registrationNumber: 'Т555ТТ74', country: 'RU', color: 'Красный' },
  { key: 'C6', participant: 'P6', brand: 'Hyundai', model: 'Solaris', registrationNumber: 'Н666НН72', country: 'RU', color: 'Серый' },
  { key: 'C7', participant: 'P7', brand: 'Volkswagen', model: 'Golf', registrationNumber: 'Р777РР45', country: 'RU', color: 'Зелёный' },
  { key: 'C8', participant: 'P8', brand: 'Subaru', model: 'Impreza', registrationNumber: 'С888СС55', country: 'RU', color: 'Синий' },
  { key: 'C9', participant: 'P1', brand: 'Honda', model: 'Civic', registrationNumber: 'Х999ХХ72', country: 'RU', color: 'Белый' },
];

const configs: Record<string, {
  name: string;
  isolation: string;
  description: string;
  headUnits: { brand: string; model: string; direction: 'FRONT' | 'REAR' | 'SUB' }[];
  components: { brand: string; model: string; quantity: number; type: 'SUBWOOFER' | 'MIDBASS' | 'MIDRANGE' | 'HORN' | 'OTHER'; direction: 'FRONT' | 'REAR' | 'SUB' }[];
  amplifiers: { brand: string; model: string; quantity: number; direction: 'FRONT' | 'REAR' | 'SUB' }[];
  batteries: { brand: string; model: string; quantity: number }[];
  generators: { brand: string; model: string; quantity: number }[];
}> = {
  C1: {
    name: 'SPL Kalina — сезон 2026',
    isolation: 'STP Aero + STP Silver + Biplast Wave',
    description: 'Боевой SPL-конфиг: 3×20 снизу, 6 рупоров, 3×20 сверху.',
    headUnits: [{ brand: 'Alpine', model: 'UTE-92BT', direction: 'FRONT' }, { brand: 'Pioneer', model: 'MVH-S120UB', direction: 'REAR' }],
    components: [
      { brand: 'Arnold', model: '81AC', quantity: 6, type: 'MIDRANGE', direction: 'FRONT' },
      { brand: 'Arnold', model: '81AC', quantity: 6, type: 'MIDRANGE', direction: 'REAR' },
      { brand: 'AT', model: 'AT37 Sport', quantity: 6, type: 'HORN', direction: 'FRONT' },
    ],
    amplifiers: [{ brand: 'Atom', model: '3.5k', quantity: 1, direction: 'FRONT' }, { brand: 'Atom', model: '700.2', quantity: 3, direction: 'REAR' }],
    batteries: [{ brand: 'Mangata', model: 'LiFePO4', quantity: 4 }],
    generators: [{ brand: 'Custom', model: '320A', quantity: 1 }],
  },
  C2: {
    name: 'Priora — SPL',
    isolation: 'STP Aero + STP Silver',
    description: 'Усиленная передняя часть, два усилителя и дополнительный генератор.',
    headUnits: [{ brand: 'Pioneer', model: 'DMH-Z5350BT', direction: 'FRONT' }],
    components: [
      { brand: 'DD Audio', model: 'VO-M6.5', quantity: 4, type: 'MIDRANGE', direction: 'FRONT' },
      { brand: 'Pride', model: 'Ruby 6.5', quantity: 4, type: 'MIDBASS', direction: 'REAR' },
    ],
    amplifiers: [{ brand: 'Pride', model: 'Quattro XL', quantity: 1, direction: 'FRONT' }, { brand: 'Avatar', model: 'ATU-3500.1D', quantity: 1, direction: 'SUB' }],
    batteries: [{ brand: 'Optima', model: 'YellowTop', quantity: 2 }],
    generators: [{ brand: 'Генератор', model: '250A', quantity: 1 }],
  },
  C3: {
    name: 'Mark II — Wicket',
    isolation: 'STP Aero + STP Black Silver',
    description: 'Сбалансированный повседневный и соревновательный конфиг.',
    headUnits: [{ brand: 'Alpine', model: 'UTE-204DAB', direction: 'FRONT' }],
    components: [
      { brand: 'Arnold', model: '81AC', quantity: 4, type: 'MIDRANGE', direction: 'FRONT' },
      { brand: 'Arnold', model: 'AT37', quantity: 4, type: 'HORN', direction: 'FRONT' },
    ],
    amplifiers: [{ brand: 'Atom', model: '700.2', quantity: 2, direction: 'FRONT' }, { brand: 'Atom', model: '3.5k', quantity: 1, direction: 'SUB' }],
    batteries: [{ brand: 'Varta', model: 'AGM H7', quantity: 2 }],
    generators: [{ brand: 'Генератор', model: '180A', quantity: 1 }],
  },
  C4: {
    name: 'E36 — Wall',
    isolation: 'STP Aero + STP Accent',
    description: 'Wall-конфигурация с мощной сабовой секцией.',
    headUnits: [{ brand: 'Pioneer', model: 'MVH-S120UB', direction: 'FRONT' }],
    components: [
      { brand: 'Skar', model: 'FSX10', quantity: 4, type: 'MIDBASS', direction: 'FRONT' },
      { brand: 'Sundown Audio', model: 'X12', quantity: 2, type: 'SUBWOOFER', direction: 'SUB' },
    ],
    amplifiers: [{ brand: 'Sundown Audio', model: 'SFB-3000D', quantity: 1, direction: 'SUB' }, { brand: 'Ural', model: 'PT 4.260', quantity: 1, direction: 'FRONT' }],
    batteries: [{ brand: 'Optima', model: 'RedTop', quantity: 2 }],
    generators: [{ brand: 'Генератор', model: '270A', quantity: 1 }],
  },
  C5: {
    name: 'Granta — Gate',
    isolation: 'STP Silver + Biplast',
    description: 'Gate-конфигурация для BFSPL.',
    headUnits: [{ brand: 'Kenwood', model: 'KMM-BT309', direction: 'FRONT' }],
    components: [
      { brand: 'Avatar', model: 'MTU-81', quantity: 6, type: 'MIDRANGE', direction: 'FRONT' },
      { brand: 'Avatar', model: 'MTU-81', quantity: 2, type: 'HORN', direction: 'FRONT' },
    ],
    amplifiers: [{ brand: 'Avatar', model: 'ABR-4000.1D', quantity: 1, direction: 'SUB' }, { brand: 'Avatar', model: 'MTU-4.80', quantity: 1, direction: 'FRONT' }],
    batteries: [{ brand: 'Kicx', model: 'AGM 100Ah', quantity: 2 }],
    generators: [{ brand: 'Генератор', model: '200A', quantity: 1 }],
  },
  C6: {
    name: 'Solaris — BassRace',
    isolation: 'STP Aero + STP Black',
    description: 'BassRace-конфиг с двумя сабвуферами.',
    headUnits: [{ brand: 'Pioneer', model: 'MVH-S120UB', direction: 'FRONT' }],
    components: [{ brand: 'Deaf Bonce', model: 'AP-M61AC', quantity: 4, type: 'MIDRANGE', direction: 'FRONT' }],
    amplifiers: [{ brand: 'Deaf Bonce', model: 'Machete MFA-4.400', quantity: 1, direction: 'FRONT' }, { brand: 'Deaf Bonce', model: 'AAB-3900.1D', quantity: 1, direction: 'SUB' }],
    batteries: [{ brand: 'Stinger', model: 'SPV69', quantity: 2 }],
    generators: [{ brand: 'Генератор', model: '220A', quantity: 1 }],
  },
  C7: {
    name: 'Golf — Street',
    isolation: 'STP Silver',
    description: 'Тестовая конфигурация для проверки второго этапа и отмененной регистрации.',
    headUnits: [{ brand: 'Sony', model: 'DSX-A416BT', direction: 'FRONT' }],
    components: [{ brand: 'Ural', model: 'AS-D165 ARMADA', quantity: 2, type: 'MIDBASS', direction: 'FRONT' }],
    amplifiers: [{ brand: 'Ural', model: 'AKM 4.90', quantity: 1, direction: 'FRONT' }],
    batteries: [{ brand: 'Varta', model: 'Blue Dynamic', quantity: 1 }],
    generators: [{ brand: 'Штатный', model: '150A', quantity: 1 }],
  },
  C8: {
    name: 'Impreza — BDW',
    isolation: 'STP Aero + STP Silver + Biplast',
    description: 'BDW тестовый конфиг.',
    headUnits: [{ brand: 'Alpine', model: 'UTE-92BT', direction: 'FRONT' }],
    components: [{ brand: 'Arnold', model: '81AC', quantity: 4, type: 'MIDRANGE', direction: 'FRONT' }],
    amplifiers: [{ brand: 'Atom', model: '3.5k', quantity: 1, direction: 'SUB' }],
    batteries: [{ brand: 'Optima', model: 'YellowTop', quantity: 2 }],
    generators: [{ brand: 'Генератор', model: '250A', quantity: 1 }],
  },
  C9: {
    name: 'Civic — второй автомобиль',
    isolation: 'STP Silver + Biplast',
    description: 'Второй автомобиль участника для проверки нескольких машин.',
    headUnits: [{ brand: 'Pioneer', model: 'MVH-S120UB', direction: 'FRONT' }],
    components: [{ brand: 'Ural', model: 'AS-D165 ARMADA', quantity: 4, type: 'MIDBASS', direction: 'FRONT' }],
    amplifiers: [{ brand: 'Ural', model: 'AKM 4.90', quantity: 1, direction: 'FRONT' }],
    batteries: [{ brand: 'Varta', model: 'AGM', quantity: 1 }],
    generators: [{ brand: 'Штатный', model: '160A', quantity: 1 }],
  },
};

function dateOnly(value: string) {
  return new Date(value + 'T00:00:00.000Z');
}

async function main() {
  console.log('=== USD 2.0 TEST SEED ===');

  const passwordHash = await bcrypt.hash('TestPassword123!', 12);

  // 1. Base format data. The regular seed already creates these, but
  // this makes the test seed self-contained and safe to run first.
  const directionData = [
    { name: 'SPL', sortOrder: 1, classes: [
      ['LIMITED_2_0', 'Limited 2.0', 1, 'DB'],
      ['1X2', '1x2', 2, 'DB'],
      ['2X2', '2x2', 3, 'DB'],
      ['NOLIM', 'NoLim', 4, 'DB'],
      ['SEDAN', 'Sedan', 5, 'DB'],
      ['COFFIN', 'Coffin', 6, 'DB'],
      ['WALL', 'Wall', 7, 'DB'],
      ['WALL_PLUS', 'Wall+', 8, 'DB'],
      ['MAD_X', 'Mad-X', 9, 'DB'],
    ]},
    { name: 'BFSPL', sortOrder: 2, classes: [
      ['GATE_1_6', 'Gate 1-6', 1, 'DB'],
      ['WICKET_6_10', 'Wicket 6-10', 2, 'DB'],
      ['WICKET_10_PLUS', 'Wicket 10+', 3, 'DB'],
    ]},
    { name: 'BDWSPL', sortOrder: 3, classes: [
      ['BDW', 'BDW', 1, 'DB'],
      ['BDW_EX', 'BDW Ex', 2, 'DB'],
    ]},
    { name: 'BassRace', sortOrder: 4, classes: [
      ['BASSRACE_129_9', 'BassRace 129.9', 1, 'DB'],
      ['BASSRACE_139_9', 'BassRace 139.9', 2, 'DB'],
      ['BASSRACE_149_9', 'BassRace 149.9', 3, 'DB'],
      ['BASSRACE_159_9', 'BassRace 159.9', 4, 'DB'],
    ]},
    { name: 'Hurrican', sortOrder: 5, classes: [
      ['STORM_WALL', 'Storm Wall', 1, 'MPS'],
    ]},
  ] as const;

  const classMap = new Map<string, any>();
  for (const directionDataItem of directionData) {
    const direction = await prisma.direction.upsert({
      where: { id: (await prisma.direction.findFirst({ where: { name: directionDataItem.name }, select: { id: true } }))?.id ?? '00000000-0000-0000-0000-000000000000' },
      update: { sortOrder: directionDataItem.sortOrder, isActive: true },
      create: { name: directionDataItem.name, sortOrder: directionDataItem.sortOrder, isActive: true },
    });

    for (const [code, name, sortOrder, unit] of directionDataItem.classes) {
      const cls = await prisma.class.upsert({
        where: { code },
        update: { directionId: direction.id, name, sortOrder, unit: unit as any, isActive: true },
        create: { directionId: direction.id, code, name, sortOrder, unit: unit as any, isActive: true },
      });
      classMap.set(code, cls);
    }
  }

  // 2. Season.
  const season = await prisma.season.upsert({
    where: { year: 2026 },
    update: { name: 'USD 2026', status: 'ACTIVE', isActive: true, description: 'Тестовый сезон USD 2.0 — постоянные dev/test данные.' },
    create: { name: 'USD 2026', year: 2026, status: 'ACTIVE', isActive: true, description: 'Тестовый сезон USD 2.0 — постоянные dev/test данные.' },
  });

  // 3. Stages: completed, nearest/upcoming, future.
  const stageSpecs = [
    { key: 'S1', number: 1, name: 'USD 2026 — Этап 1', city: 'Тюмень', date: '2026-09-12', status: 'COMPLETED' as const, registrationOpen: false, venue: 'Тюменский автодром', address: 'Тюмень, тестовая площадка' },
    { key: 'S2', number: 2, name: 'USD 2026 — Этап 2', city: 'Екатеринбург', date: '2026-10-18', status: 'PUBLISHED' as const, registrationOpen: true, venue: 'Екатеринбург Экспо', address: 'Екатеринбург, тестовая площадка' },
    { key: 'S3', number: 3, name: 'USD 2026 — Этап 3', city: 'Челябинск', date: '2026-11-14', status: 'PUBLISHED' as const, registrationOpen: false, venue: 'Трасса Автоград', address: 'Челябинск, тестовая площадка' },
  ];

  const stages = new Map<string, any>();
  for (const spec of stageSpecs) {
    const stage = await prisma.stage.upsert({
      where: { legacyId: TEST_PREFIX + spec.key },
      update: {
        seasonId: season.id,
        stageNumber: spec.number,
        name: spec.name,
        city: spec.city,
        date: dateOnly(spec.date),
        status: spec.status,
        registrationOpen: spec.registrationOpen,
        venue: spec.venue,
        address: spec.address,
        isDeleted: false,
      },
      create: {
        seasonId: season.id,
        stageNumber: spec.number,
        name: spec.name,
        city: spec.city,
        date: dateOnly(spec.date),
        status: spec.status,
        registrationOpen: spec.registrationOpen,
        registrationStartsAt: spec.registrationOpen ? dateOnly('2026-10-01') : null,
        registrationEndsAt: spec.registrationOpen ? dateOnly('2026-10-17') : null,
        venue: spec.venue,
        address: spec.address,
        isDeleted: false,
        legacyId: TEST_PREFIX + spec.key,
      },
    });
    stages.set(spec.key, stage);
  }

  const allStageClasses = [
    ['LIMITED_2_0', null], ['1X2', null], ['2X2', null],
    ['WALL', null], ['WICKET_6_10', null], ['WICKET_10_PLUS', null],
    ['GATE_1_6', null], ['BDW', null], ['BDW_EX', null],
    ['BASSRACE_139_9', null], ['STORM_WALL', null],
  ] as const;

  for (const stage of stages.values()) {
    for (let i = 0; i < allStageClasses.length; i++) {
      const [code, customName] = allStageClasses[i];
      const cls = classMap.get(code);
      await prisma.stageClass.upsert({
        where: { stageId_classId: { stageId: stage.id, classId: cls.id } },
        update: { sortOrder: i + 1, isActive: true, customName },
        create: { stageId: stage.id, classId: cls.id, sortOrder: i + 1, isActive: true, customName },
      });
    }
  }

  // 4. Participants and participant accounts.
  const participantMap = new Map<string, any>();
  for (const p of participants) {
    const participant = await prisma.participant.upsert({
      where: { legacyId: TEST_PREFIX + p.key },
      update: {
        lastName: p.lastName,
        firstName: p.firstName,
        middleName: p.middleName,
        team: p.team,
        phone: p.phone,
        city: p.city,
        birthDate: dateOnly(p.birthDate),
        isPublic: true,
      },
      create: {
        lastName: p.lastName,
        firstName: p.firstName,
        middleName: p.middleName,
        team: p.team,
        phone: p.phone,
        city: p.city,
        birthDate: dateOnly(p.birthDate),
        isPublic: true,
        legacyId: TEST_PREFIX + p.key,
      },
    });
    participantMap.set(p.key, participant);

    await prisma.user.upsert({
      where: { email: p.email },
      update: {
        name: `${p.firstName} ${p.lastName}`,
        role: 'PARTICIPANT',
        isActive: true,
        emailVerifiedAt: new Date(),
        participantId: participant.id,
        passwordHash,
      },
      create: {
        email: p.email,
        name: `${p.firstName} ${p.lastName}`,
        role: 'PARTICIPANT',
        isActive: true,
        emailVerifiedAt: new Date(),
        participantId: participant.id,
        passwordHash,
      },
    });
  }

  const judge = await prisma.user.upsert({
    where: { email: 'judge.test@example.com' },
    update: { name: 'Судья Тестовый', role: 'JUDGE', isActive: true, emailVerifiedAt: new Date(), passwordHash },
    create: { email: 'judge.test@example.com', name: 'Судья Тестовый', role: 'JUDGE', isActive: true, emailVerifiedAt: new Date(), passwordHash },
  });

  // 5. Cars and complete configuration trees.
  const carMap = new Map<string, any>();
  for (const c of cars) {
    const car = await prisma.car.upsert({
      where: { legacyId: TEST_PREFIX + c.key },
      update: {
        participantId: participantMap.get(c.participant).id,
        brand: c.brand,
        model: c.model,
        registrationNumber: c.registrationNumber,
        registrationCountry: c.country as any,
        color: c.color,
        isActive: true,
        isPublic: true,
      },
      create: {
        participantId: participantMap.get(c.participant).id,
        brand: c.brand,
        model: c.model,
        registrationNumber: c.registrationNumber,
        registrationCountry: c.country as any,
        color: c.color,
        isActive: true,
        isPublic: true,
        legacyId: TEST_PREFIX + c.key,
      },
    });
    carMap.set(c.key, car);

    let configuration = await prisma.carConfiguration.findFirst({ where: { carId: car.id, name: configs[c.key].name } });
    if (!configuration) {
      configuration = await prisma.carConfiguration.create({
        data: { carId: car.id, name: configs[c.key].name, currentVersion: 1, isActive: true },
      });
    } else {
      configuration = await prisma.carConfiguration.update({
        where: { id: configuration.id },
        data: { currentVersion: 1, isActive: true },
      });
    }

    let version = await prisma.carConfigurationVersion.findFirst({ where: { configurationId: configuration.id, version: 1 } });
    if (!version) {
      version = await prisma.carConfigurationVersion.create({
        data: {
          configurationId: configuration.id,
          version: 1,
          vibrationIsolation: configs[c.key].isolation,
          additionalDescription: configs[c.key].description,
        },
      });
    } else {
      version = await prisma.carConfigurationVersion.update({
        where: { id: version.id },
        data: { vibrationIsolation: configs[c.key].isolation, additionalDescription: configs[c.key].description },
      });
      await prisma.carHeadUnit.deleteMany({ where: { versionId: version.id } });
      await prisma.carAudioComponent.deleteMany({ where: { versionId: version.id } });
      await prisma.carAmplifier.deleteMany({ where: { versionId: version.id } });
      await prisma.carBattery.deleteMany({ where: { versionId: version.id } });
      await prisma.carGenerator.deleteMany({ where: { versionId: version.id } });
    }

    for (const item of configs[c.key].headUnits) {
      await prisma.carHeadUnit.create({ data: { versionId: version.id, ...item } });
    }

    const componentIds: string[] = [];
    for (const item of configs[c.key].components) {
      const component = await prisma.carAudioComponent.create({ data: { versionId: version.id, ...item } });
      componentIds.push(component.id);
    }

    const amplifierIds: string[] = [];
    for (const item of configs[c.key].amplifiers) {
      const amplifier = await prisma.carAmplifier.create({ data: { versionId: version.id, ...item } });
      amplifierIds.push(amplifier.id);
    }

    if (amplifierIds.length && componentIds.length) {
      await prisma.carAmplifierComponent.create({
        data: { amplifierId: amplifierIds[0], componentId: componentIds[0], quantity: 1 },
      });
    }

    for (const item of configs[c.key].batteries) {
      await prisma.carBattery.create({ data: { versionId: version.id, ...item } });
    }
    for (const item of configs[c.key].generators) {
      await prisma.carGenerator.create({ data: { versionId: version.id, ...item } });
    }
  }

  // 6. Registrations. Stage 1 is historical; stage 2 is the active dashboard set.
  const registrationSpecs = [
    { key: 'R1', stage: 'S1', participant: 'P1', car: 'C1', classes: ['LIMITED_2_0', 'WICKET_6_10', 'STORM_WALL'], source: 'PRE_REGISTRATION' as const, status: 'ACTIVE' as const, number: 1 },
    { key: 'R2', stage: 'S1', participant: 'P2', car: 'C2', classes: ['1X2', 'WICKET_10_PLUS'], source: 'ON_SITE' as const, status: 'ACTIVE' as const, number: 2 },
    { key: 'R3', stage: 'S1', participant: 'P3', car: 'C3', classes: ['WALL', 'GATE_1_6'], source: 'IMPORT' as const, status: 'ACTIVE' as const, number: 3 },
    { key: 'R4', stage: 'S1', participant: 'P4', car: 'C4', classes: ['2X2', 'BDW'], source: 'PRE_REGISTRATION' as const, status: 'ACTIVE' as const, number: 4 },
    { key: 'R5', stage: 'S1', participant: 'P5', car: 'C5', classes: ['GATE_1_6', 'BASSRACE_139_9'], source: 'PRE_REGISTRATION' as const, status: 'ACTIVE' as const, number: 5 },
    { key: 'R6', stage: 'S1', participant: 'P6', car: 'C6', classes: ['BASSRACE_149_9'], source: 'PRE_REGISTRATION' as const, status: 'ACTIVE' as const, number: 6 },
    { key: 'R7', stage: 'S2', participant: 'P1', car: 'C1', classes: ['LIMITED_2_0', 'WICKET_6_10', 'STORM_WALL'], source: 'PRE_REGISTRATION' as const, status: 'ACTIVE' as const, number: 1 },
    { key: 'R8', stage: 'S2', participant: 'P2', car: 'C2', classes: ['1X2', 'WICKET_10_PLUS'], source: 'ON_SITE' as const, status: 'ACTIVE' as const, number: 2 },
    { key: 'R9', stage: 'S2', participant: 'P3', car: 'C3', classes: ['WALL', 'GATE_1_6'], source: 'PRE_REGISTRATION' as const, status: 'ACTIVE' as const, number: 3 },
    { key: 'R10', stage: 'S2', participant: 'P4', car: 'C4', classes: ['2X2', 'BDW'], source: 'PRE_REGISTRATION' as const, status: 'ACTIVE' as const, number: 4 },
    { key: 'R11', stage: 'S2', participant: 'P5', car: 'C5', classes: ['GATE_1_6', 'BASSRACE_139_9'], source: 'PRE_REGISTRATION' as const, status: 'ACTIVE' as const, number: 5 },
    { key: 'R12', stage: 'S2', participant: 'P6', car: 'C6', classes: ['BASSRACE_149_9'], source: 'IMPORT' as const, status: 'ACTIVE' as const, number: 6 },
    { key: 'R13', stage: 'S2', participant: 'P7', car: 'C7', classes: ['LIMITED_2_0'], source: 'PRE_REGISTRATION' as const, status: 'CANCELLED' as const, number: 7 },
    { key: 'R14', stage: 'S2', participant: 'P8', car: 'C8', classes: ['BDW_EX'], source: 'PRE_REGISTRATION' as const, status: 'ACTIVE' as const, number: 8 },
  ];

  const registrationMap = new Map<string, any>();
  for (const r of registrationSpecs) {
    const stage = stages.get(r.stage);
    const participant = participantMap.get(r.participant);
    const car = carMap.get(r.car);
    const configuration = await prisma.carConfiguration.findFirst({ where: { carId: car.id }, orderBy: { id: 'asc' } });
    const version = await prisma.carConfigurationVersion.findFirst({ where: { configurationId: configuration!.id, version: 1 }, include: { configuration: true, headUnits: true, audioComponents: true, amplifiers: { include: { componentLinks: true } }, batteries: true, generators: true } });

    const snapshot = {
      configurationId: version!.configurationId,
      configurationName: version!.configuration.name,
      version: version!.version,
      vibrationIsolation: version!.vibrationIsolation,
      additionalDescription: version!.additionalDescription,
      headUnits: version!.headUnits,
      audioComponents: version!.audioComponents,
      amplifiers: version!.amplifiers,
      batteries: version!.batteries,
      generators: version!.generators,
    };

    const existing = await prisma.registration.findUnique({ where: { legacyId: TEST_PREFIX + r.key } });
    const registration = existing
      ? await prisma.registration.update({
          where: { id: existing.id },
          data: {
            stageId: stage.id,
            participantId: participant.id,
            carId: car.id,
            configurationVersionId: version!.id,
            configurationSnapshot: snapshot,
            participantNumber: r.number,
            source: r.source,
            status: r.status,
          },
        })
      : await prisma.registration.create({
          data: {
            stageId: stage.id,
            participantId: participant.id,
            carId: car.id,
            configurationVersionId: version!.id,
            configurationSnapshot: snapshot,
            participantNumber: r.number,
            source: r.source,
            status: r.status,
            legacyId: TEST_PREFIX + r.key,
          },
        });

    for (const code of r.classes) {
      await prisma.registrationClass.upsert({
        where: {
          registrationId_classId: {
            registrationId: registration.id,
            classId: classMap.get(code).id,
          },
        },
        update: {},
        create: {
          registrationId: registration.id,
          classId: classMap.get(code).id,
        },
      });
    }

    registrationMap.set(r.key, registration);
  }

  // 7. Inspections: passed, failed and pending.
  const inspectionSpecs = [
    ['R1', 'PASSED', 'Документы и оборудование проверены.'],
    ['R2', 'PASSED', 'Проверка пройдена.'],
    ['R3', 'PASSED', 'Проверка пройдена.'],
    ['R4', 'PASSED', 'Проверка пройдена.'],
    ['R5', 'PASSED', 'Проверка пройдена.'],
    ['R6', 'PASSED', 'Проверка пройдена.'],
    ['R7', 'PASSED', 'Этап 2: предварительная проверка пройдена.'],
    ['R8', 'FAILED', 'Не соответствует требованиям по оборудованию.'],
    ['R9', 'PASSED', 'Проверка пройдена.'],
    ['R10', 'PASSED', 'Проверка пройдена.'],
    ['R11', 'FAILED', 'Требуется исправление замечаний до допуска.'],
  ] as const;

  for (const [key, status, notes] of inspectionSpecs) {
    const reg = registrationMap.get(key);
    const existing = await prisma.inspection.findUnique({ where: { registrationId: reg.id } });
    const data = {
      status,
      checkedByUserId: judge.id,
      createdByUserId: judge.id,
      checkedByName: 'Судья Тестовый',
      checkedAt: new Date(),
      notes,
    };
    if (existing) {
      await prisma.inspection.update({ where: { id: existing.id }, data });
    } else {
      await prisma.inspection.create({ data: { registrationId: reg.id, ...data } });
    }
  }

  // 8. Realistic stage 1 results.
  const resultSpecs = [
    ['R1', 'LIMITED_2_0', 148.32, 1],
    ['R1', 'WICKET_6_10', 146.71, 2],
    ['R1', 'STORM_WALL', 18.42, 1],
    ['R2', '1X2', 145.88, 2],
    ['R2', 'WICKET_10_PLUS', 147.15, 1],
    ['R3', 'WALL', 149.06, 1],
    ['R3', 'GATE_1_6', 143.72, 3],
    ['R4', '2X2', 146.44, 1],
    ['R4', 'BDW', 145.91, 2],
    ['R5', 'GATE_1_6', 145.02, 1],
    ['R5', 'BASSRACE_139_9', 139.72, 1],
    ['R6', 'BASSRACE_149_9', 148.91, 1],
  ] as const;

  for (const [regKey, classCode, value, place] of resultSpecs) {
    const reg = registrationMap.get(regKey);
    const rc = await prisma.registrationClass.findFirst({ where: { registrationId: reg.id, classId: classMap.get(classCode).id } });
    const unit = classMap.get(classCode).unit;
    const existing = await prisma.result.findUnique({ where: { registrationClassId: rc!.id } });
    const resultData = {
      registrationId: reg.id,
      registrationClassId: rc!.id,
      value,
      unit,
      place,
      isBest: place === 1,
      notes: 'Тестовый результат USD 2.0.',
      createdByUserId: judge.id,
      isHistorical: false,
      verificationStatus: 'NOT_REQUIRED' as const,
    };
    const result = existing
      ? await prisma.result.update({ where: { id: existing.id }, data: resultData })
      : await prisma.result.create({ data: resultData });

    await prisma.record.upsert({
      where: { resultId: result.id },
      update: {
        classId: rc!.classId,
        seasonId: season.id,
        stageId: stages.get('S1').id,
        participantId: reg.participantId,
        carId: reg.carId,
        value,
        unit,
        achievedAt: stages.get('S1').date,
        isCurrent: place === 1,
        notes: 'Тестовый record.',
      },
      create: {
        classId: rc!.classId,
        seasonId: season.id,
        stageId: stages.get('S1').id,
        participantId: reg.participantId,
        carId: reg.carId,
        resultId: result.id,
        value,
        unit,
        achievedAt: stages.get('S1').date,
        isCurrent: place === 1,
        notes: 'Тестовый record.',
      },
    });
  }

  // 9. Disqualifications: active STAGE + revoked SEASON.
  const dqStage = stages.get('S1');
  const dqParticipant = participantMap.get('P4');
  const existingStageDq = await prisma.disqualification.findFirst({
    where: { participantId: dqParticipant.id, scope: 'STAGE', stageId: dqStage.id, reason: 'Тестовая дисквалификация этапа' },
  });
  if (!existingStageDq) {
    await prisma.disqualification.create({
      data: {
        participantId: dqParticipant.id,
        scope: 'STAGE',
        status: 'ACTIVE',
        stageId: dqStage.id,
        reason: 'Тестовая дисквалификация этапа',
        issuedByUserId: judge.id,
      },
    });
  }

  const existingSeasonDq = await prisma.disqualification.findFirst({
    where: { participantId: participantMap.get('P5').id, scope: 'SEASON', seasonId: season.id, reason: 'Тестовая отменённая дисквалификация сезона' },
  });
  if (!existingSeasonDq) {
    await prisma.disqualification.create({
      data: {
        participantId: participantMap.get('P5').id,
        scope: 'SEASON',
        status: 'REVOKED',
        seasonId: season.id,
        reason: 'Тестовая отменённая дисквалификация сезона',
        issuedByUserId: judge.id,
        revokedByUserId: judge.id,
        revokedAt: new Date(),
        revokeReason: 'Тестовое снятие дисквалификации.',
      },
    });
  }

  // 10. Import job with both ready and warning rows.
  const existingJobs = await prisma.importJob.findMany({ where: { stageId: stages.get('S2').id } });
  let importJob = existingJobs.find((job: any) => job.metadata?.seedKey === TEST_PREFIX + 'IMPORT_1');
  if (!importJob) {
    importJob = await prisma.importJob.create({
      data: {
        stageId: stages.get('S2').id,
        status: 'DRAFT',
        createdByUserId: judge.id,
        summary: {
          participants: { new: 1, matched: 2, ambiguous: 1, onlyInResults: 0 },
          registrations: { total: 4, valid: 2, invalid: 2 },
          classes: 4,
          results: { total: 3, ready: 2, warnings: 1, preserved: 3 },
          warningsCount: 2,
        },
        metadata: { seedKey: TEST_PREFIX + 'IMPORT_1', source: 'TEST_SEED', note: 'Тестовый импорт с предупреждениями.' },
      },
    });
    await prisma.importRow.createMany({
      data: [
        {
          importJobId: importJob.id,
          type: 'REGISTRATION',
          rowNumber: 1,
          status: 'READY',
          rawData: { 'ФИО': 'Петров Иван Алексеевич', 'Номер': 1, 'Модель': 'Kalina', 'Гос. номер': 'А111АА72', 'Класс': 'Limited 2.0' },
          normalizedData: { participant: { status: 'MATCHED' }, registration: { status: 'READY' } },
          warnings: [],
        },
        {
          importJobId: importJob.id,
          type: 'REGISTRATION',
          rowNumber: 2,
          status: 'WARNING',
          rawData: { 'ФИО': 'Иванов Иван Иванович', 'Номер': 9, 'Модель': 'Lada Priora', 'Гос. номер': 'А999АА72', 'Класс': 'Limited 2.0' },
          normalizedData: { participant: { status: 'NEW' }, registration: { status: 'WARNING' } },
          warnings: ['Участник не найден в базе.', 'Автомобиль не найден в базе.'],
        },
        {
          importJobId: importJob.id,
          type: 'REGISTRATION',
          rowNumber: 3,
          status: 'WARNING',
          rawData: { 'ФИО': 'Соколов Алексей', 'Номер': 2, 'Модель': 'Priora', 'Гос. номер': 'Е222КЕ66', 'Класс': 'Неизвестный класс' },
          normalizedData: { participant: { status: 'AMBIGUOUS' }, registration: { status: 'WARNING' } },
          warnings: ['Класс не найден или не назначен этапу.'],
        },
        {
          importJobId: importJob.id,
          type: 'RESULT',
          rowNumber: 1,
          status: 'READY',
          rawData: { 'Номер участника': 1, 'ФИО': 'Петров Иван Алексеевич', 'Класс': 'Limited 2.0', 'Результат': '148.32' },
          normalizedData: { participant: { status: 'MATCHED' }, result: 148.32 },
          warnings: [],
          participantNumber: 1,
          place: 1,
          value: 148.32,
          unit: 'DB',
        },
        {
          importJobId: importJob.id,
          type: 'RESULT',
          rowNumber: 2,
          status: 'READY',
          rawData: { 'Номер участника': 2, 'ФИО': 'Соколов Алексей Дмитриевич', 'Класс': '1x2', 'Результат': '145.88' },
          normalizedData: { participant: { status: 'MATCHED' }, result: 145.88 },
          warnings: [],
          participantNumber: 2,
          place: 2,
          value: 145.88,
          unit: 'DB',
        },
        {
          importJobId: importJob.id,
          type: 'RESULT',
          rowNumber: 9,
          status: 'WARNING',
          rawData: { 'Номер участника': 9, 'ФИО': 'Иванов Иван Иванович', 'Класс': 'Limited 2.0', 'Результат': '999.00' },
          normalizedData: { participant: { status: 'NEW' } },
          warnings: ['Участник не найден.', 'Регистрация для результата не найдена.'],
          participantNumber: 9,
          place: null,
          value: 999,
          unit: 'DB',
        },
      ],
    });
  }

  console.log('');
  console.log('Готово. Тестовые данные созданы/обновлены.');
  console.log('ADMIN: существующий production/dev admin без изменений');
  console.log('JUDGE: judge.test@example.com / TestPassword123!');
  console.log('PARTICIPANT: ivan.petrov.test@example.com / TestPassword123!');
  console.log('Этап 1: 12.09.2026 — завершён');
  console.log('Этап 2: 18.10.2026 — ближайший, регистрация открыта');
  console.log('Этап 3: 14.11.2026 — будущий');
  console.log('Активные регистрации этапа 2: 7 (1 отменена, 7 активных включая P8)');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
