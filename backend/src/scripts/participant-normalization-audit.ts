import { Client } from 'pg';
import { NameNormalizerService } from '../common/names/name-normalizer.service';

type ParticipantRow = {
  id: string; firstName: string; lastName: string; middleName: string | null;
  team: string | null; city: string | null; phone: string | null;
  createdAt: string; cars: string; registrations: string; userId: string | null;
  email: string | null; role: string | null;
};

function clean(value: unknown): string {
  return String(value ?? '').normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u00A0\u202F]/g, ' ').trim().replace(/\s+/g, ' ');
}
function key(value: unknown): string {
  return clean(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}
function groupBy<T>(rows: T[], keyOf: (row: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(row); groups.set(key, group);
  }
  return [...groups.values()].filter(group => group.length > 1);
}
function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length < 4 ? '***' : '***' + digits.slice(-4);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const client = new Client({ connectionString, connectionTimeoutMillis: 10000, query_timeout: 30000 });
  const normalizer = new NameNormalizerService();
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const { rows } = await client.query<ParticipantRow>(`
      SELECT p."id", p."firstName", p."lastName", p."middleName", p."team", p."city", p."phone",
             p."createdAt"::text AS "createdAt",
             (SELECT COUNT(*)::text FROM "Car" c WHERE c."participantId" = p."id") AS cars,
             (SELECT COUNT(*)::text FROM "Registration" r WHERE r."participantId" = p."id") AS registrations,
             u."id" AS "userId", u."email", u."role"
      FROM "Participant" p
      LEFT JOIN "User" u ON u."participantId" = p."id"
      ORDER BY p."lastName", p."firstName"
    `);
    const byName = groupBy(rows, p => [
      key(normalizer.normalize(p.lastName)),
      key(normalizer.normalize(p.firstName)),
      key(normalizer.normalize(p.middleName))
    ].join('|')).filter(g => g[0].lastName && g[0].firstName);
    const byNameOrderInsensitive = groupBy(rows, p => [
      key(normalizer.normalize(p.firstName)), key(normalizer.normalize(p.lastName)),
      key(normalizer.normalize(p.middleName))
    ].sort().join('|')).filter(g => g[0].lastName && g[0].firstName);
    const byPhone = groupBy(rows.filter(p => String(p.phone ?? '').replace(/\D/g, '').length >= 8),
      p => String(p.phone ?? '').replace(/\D/g, ''));
    const dupPeople = (groups: ParticipantRow[][]) => groups.map(group => ({
      normalizedName: [normalizer.normalize(group[0].lastName), normalizer.normalize(group[0].firstName),
        normalizer.normalize(group[0].middleName)].filter(Boolean).join(' '),
      participants: group.map(p => ({
        id: p.id, name: [p.lastName,p.firstName,p.middleName].filter(Boolean).join(' '),
        team: p.team, city: p.city, phoneMasked: maskPhone(p.phone),
        cars: Number(p.cars), registrations: Number(p.registrations),
        account: p.userId ? { userId: p.userId, email: p.email, role: p.role } : null,
        createdAt: p.createdAt
      }))
    }));
    const report = {
      generatedAt: new Date().toISOString(),
      mode: 'READ_ONLY',
      database: (await client.query('SELECT current_database() AS name')).rows[0].name,
      totals: { participants: rows.length, duplicateExactNormalizedGroups: byName.length,
        duplicateOrderInsensitiveGroups: byNameOrderInsensitive.length, duplicatePhoneGroups: byPhone.length },
      duplicateExactNormalized: dupPeople(byName),
      duplicateOrderInsensitive: dupPeople(byNameOrderInsensitive),
      duplicatePhones: byPhone.map(group => ({ phoneMasked: maskPhone(group[0].phone),
        participants: group.map(p => ({ id:p.id, name:[p.lastName,p.firstName,p.middleName].filter(Boolean).join(' '),
          cars:Number(p.cars), registrations:Number(p.registrations), userId:p.userId, email:p.email })) })),
      note: 'Read-only candidate report. No rows were changed or merged. Name and phone matches require manual confirmation.'
    };
    console.log(JSON.stringify(report, null, 2));
    await client.query('ROLLBACK');
  } finally {
    await client.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
