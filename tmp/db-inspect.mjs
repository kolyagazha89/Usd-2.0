import fs from 'node:fs';
import pg from 'pg';

const sourcePath = new URL('../data/historical-xlsx.json', import.meta.url);
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const registrations = source['USD _ Регистрация.xlsx'] ?? {};
const results = source['USD _ Результаты.xlsx'] ?? {};
const has = (v) => v !== null && v !== undefined && String(v).trim() !== '';
const norm = (v) => String(v ?? '').normalize('NFKC').toLocaleLowerCase('ru')
  .replace(/ё/g, 'е').replace(/[^\\p{L}\\p{N}]+/gu, ' ').trim().replace(/\\s+/g, ' ');

const sourceResultStats = Object.entries(results).map(([sheet, rows]) => {
  let cls = '';
  let count = 0;
  const classes = {};
  const zeroByClass = {};
  for (const row of rows.slice(1)) {
    if (has(row[0])) cls = String(row[0]).trim();
    if (!has(row[4])) continue;
    count++;
    classes[cls] = (classes[cls] ?? 0) + 1;
    if (Number(row[2]) === 0) zeroByClass[cls] = (zeroByClass[cls] ?? 0) + 1;
  }
  return { sheet, expectedResults: count, classes, zeroNumberByClass: zeroByClass };
});
const sourceRegistrationStats = Object.entries(registrations).map(([sheet, rows]) => ({
  sheet,
  helperRegistrations: rows.slice(1).filter(row => has(row[1])).length,
}));

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const identity = await client.query('select current_database() as database, inet_server_addr()::text as server_address, current_user as db_user');
  const tableNames = ['Season','Stage','Participant','Car','CarConfigurationVersion','Registration','RegistrationNumber','RegistrationClass','Class','Result','Record','Inspection','Disqualification','ImportJob','ImportRow'];
  const counts = {};
  for (const table of tableNames) {
    try {
      const result = await client.query('select count(*)::int as count from "' + table + '"');
      counts[table] = result.rows[0].count;
    } catch (error) {
      counts[table] = 'QUERY_ERROR:' + String(error.code ?? error.message).slice(0, 80);
    }
  }
  const stages = await client.query(`
    SELECT se.year, s.id, s.name, s.city, s.date::date AS date, s.status, s."isDeleted",
      (SELECT count(*)::int FROM "Registration" r WHERE r."stageId" = s.id) AS registrations,
      (SELECT count(*)::int FROM "RegistrationClass" rc JOIN "Registration" r ON r.id = rc."registrationId" WHERE r."stageId" = s.id) AS registration_classes,
      (SELECT count(*)::int FROM "RegistrationNumber" rn WHERE rn."stageId" = s.id) AS registration_numbers,
      (SELECT count(*)::int FROM "Result" x JOIN "Registration" r ON r.id = x."registrationId" WHERE r."stageId" = s.id) AS results,
      (SELECT count(*)::int FROM "Result" x JOIN "Registration" r ON r.id = x."registrationId" WHERE r."stageId" = s.id AND x."isHistorical" = true) AS historical_results,
      (SELECT count(*)::int FROM "Registration" r WHERE r."stageId" = s.id AND r."participantNumber" < 1) AS invalid_registration_numbers,
      (SELECT count(*)::int FROM "RegistrationNumber" rn WHERE rn."stageId" = s.id AND rn.number < 1) AS invalid_assigned_numbers
    FROM "Stage" s JOIN "Season" se ON se.id = s."seasonId"
    ORDER BY se.year, s.date, s."stageNumber"
  `);
  const classCounts = await client.query(`
    SELECT se.year, s.name AS stage, c.name AS class,
      count(x.id)::int AS results,
      count(*) FILTER (WHERE rn.number = 0)::int AS result_rows_with_zero_assigned_number,
      count(*) FILTER (WHERE x."registrationId" <> rc."registrationId")::int AS mismatched_registration_links
    FROM "Result" x
    JOIN "Registration" r ON r.id = x."registrationId"
    JOIN "Stage" s ON s.id = r."stageId"
    JOIN "Season" se ON se.id = s."seasonId"
    JOIN "RegistrationClass" rc ON rc.id = x."registrationClassId"
    JOIN "Class" c ON c.id = rc."classId"
    LEFT JOIN "RegistrationNumber" rn ON rn.id = rc."numberId"
    GROUP BY se.year, s.name, c.name
    ORDER BY se.year, s.name, c.name
  `);
  const integrity = await client.query(`
    SELECT
      (SELECT count(*)::int FROM "Result" x JOIN "RegistrationClass" rc ON rc.id = x."registrationClassId" WHERE x."registrationId" <> rc."registrationId") AS result_registration_class_mismatches,
      (SELECT count(*)::int FROM "Registration" r LEFT JOIN "RegistrationClass" rc ON rc."registrationId" = r.id WHERE rc.id IS NULL) AS registrations_without_classes,
      (SELECT count(*)::int FROM "RegistrationClass" rc LEFT JOIN "RegistrationNumber" rn ON rn.id = rc."numberId" WHERE rn.id IS NULL) AS registration_classes_without_number,
      (SELECT count(*)::int FROM "Registration" r WHERE r."configurationSnapshot" IS NULL OR r."configurationVersionId" IS NULL) AS registrations_without_configuration_snapshot,
      (SELECT count(*)::int FROM "Result" x WHERE x."isHistorical" = true) AS historical_results_total,
      (SELECT count(*)::int FROM "ImportJob" j WHERE j.metadata->>'source' = 'HISTORICAL_XLSX') AS historical_import_jobs,
      (SELECT count(*)::int FROM "ImportJob" j WHERE j.metadata->>'source' = 'HISTORICAL_XLSX' AND j.status = 'COMMITTED') AS committed_historical_import_jobs
  `);
  const stageMap = (stage) => {
    const n = norm([stage.name, stage.city, stage.year].join(' '));
    if (stage.year === 2025 && /волгоград|volgograd/.test(n)) return 'final_volgograd2025';
    if (stage.year === 2026 && /астрахан|astraxan|astrakhan/.test(n)) return 'astraxan';
    if (stage.year === 2026 && /ижевск|ijevsk|izhevsk/.test(n)) return 'ijevsk';
    if (stage.year === 2026 && /открыти|open/.test(n) && /волгоград|volgograd/.test(n)) return 'open_volgograd2026';
    if (stage.year === 2026 && /самар|samara/.test(n)) return 'samara';
    if (stage.year === 2026 && /липец|lipetsk/.test(n)) return 'lipetsk';
    if (stage.year === 2026 && /орел|орел|orel|oryol/.test(n)) return 'orel';
    if (stage.year === 2026 && /смолен|smolensk/.test(n)) return 'smolensk';
    if (stage.year === 2026 && /ростов|rostov/.test(n) && !/финал|final/.test(n)) return 'rostov-on-don';
    if (stage.year === 2026 && /волгоград|volgograd/.test(n) && /финал|final/.test(n)) return 'final_volg2026';
    return null;
  };
  const expectedBySheet = Object.fromEntries(sourceResultStats.map(x => [x.sheet, x.expectedResults]));
  const stageComparison = stages.rows.map(s => {
    const sheet = stageMap(s);
    return { year: s.year, stage: s.name, city: s.city, date: s.date, resultsInDb: s.results, sourceSheet: sheet, expectedResults: sheet ? expectedBySheet[sheet] : null, delta: sheet ? s.results - expectedBySheet[sheet] : null, registrations: s.registrations, registrationClasses: s.registration_classes, registrationNumbers: s.registration_numbers, historicalResults: s.historical_results, invalidRegistrationNumbers: s.invalid_registration_numbers, invalidAssignedNumbers: s.invalid_assigned_numbers, deleted: s.isDeleted };
  });
  const sourceSummary = {
    registrationHelperRows: sourceRegistrationStats.reduce((n, x) => n + x.helperRegistrations, 0),
    resultRows: sourceResultStats.reduce((n, x) => n + x.expectedResults, 0),
    zeroSourceNumbers: sourceResultStats.reduce((n, x) => n + Object.values(x.zeroNumberByClass).reduce((a, b) => a + b, 0), 0),
    registrationsBySheet: sourceRegistrationStats,
    resultsBySheet: sourceResultStats.map(x => ({
      sheet: x.sheet,
      expectedResults: x.expectedResults,
      zeroNumbers: Object.values(x.zeroNumberByClass).reduce((a, b) => a + b, 0),
      zeroNumberByClass: x.zeroNumberByClass
    }))
  };
  console.log('AUDIT_DATABASE ' + JSON.stringify({ identity: identity.rows[0], tableCounts: counts, integrity: integrity.rows[0] }));
  console.log('AUDIT_SOURCE ' + JSON.stringify(sourceSummary));
  console.log('AUDIT_STAGES ' + JSON.stringify(stageComparison));
  console.log('AUDIT_CLASS_ANOMALIES ' + JSON.stringify(classCounts.rows.filter(x => x.result_rows_with_zero_assigned_number > 0 || x.mismatched_registration_links > 0)));

} finally {
  await client.end().catch(() => {});
}
