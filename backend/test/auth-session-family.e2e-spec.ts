import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

const enabled = process.env.USD_AUTH_FAMILY_TEST === '1';
const suite = enabled ? describe : describe.skip;

suite('refresh/logout families on isolated PostgreSQL 18', () => {
  let db: PrismaService, service: AuthService, userId: string;
  const hash = (token: string) => createHash('sha256').update(token).digest('hex');
  const fresh = async () => {
    const token = randomBytes(32).toString('hex'), familyId = randomUUID();
    await db.refreshSession.create({ data: { userId, familyId, tokenHash: hash(token), expiresAt: new Date(Date.now() + 86400000) } });
    return { token, familyId };
  };

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost'].includes(url.hostname)
      || !/^\/usd_identity_auth_[a-z0-9_]+$/.test(url.pathname) || url.search || url.hash) {
      throw new Error('Auth-family acceptance requires a fresh loopback usd_identity_auth_* database without overrides');
    }
    db = new PrismaService();
    await db.$connect();
    const version = await db.$queryRaw<Array<{ version: string }>>`SELECT current_setting('server_version_num') AS version`;
    if (Number(version[0].version) < 180000 || Number(version[0].version) >= 190000) throw new Error('PostgreSQL 18 required');
    if (await db.user.count() || await db.participant.count()) throw new Error('Refusing nonempty auth-family fixture');
    const user = await db.user.create({ data: { email: 'auth-' + randomUUID() + '@family.invalid', passwordHash: 'synthetic-unused', emailVerifiedAt: new Date(), isActive: true } });
    userId = user.id;
    service = new AuthService(db, new JwtService({ secret: 'synthetic-auth-family-only-32-bytes-secret' }), {} as never);
  });

  afterAll(async () => {
    // Delete only the exact synthetic user this test created, never a table.
    if (userId) await db.user.delete({ where: { id: userId } });
    await db?.$disconnect();
  });

  it('logout with a rotated ancestor revokes its successor and preserves another device family', async () => {
    const first = await fresh(), neighbour = await fresh();
    const rotated = await service.refresh(first.token);
    await service.logout(first.token);
    expect(await db.refreshSession.count({ where: { familyId: first.familyId, revokedAt: null } })).toBe(0);
    expect(await db.refreshSession.count({ where: { familyId: neighbour.familyId, revokedAt: null } })).toBe(1);
    await expect(service.refresh(rotated.refreshToken)).rejects.toThrow();
  });

  it('concurrent logout and rotation leave no usable successor in either acquisition order', async () => {
    for (let index = 0; index < 12; index++) {
      const family = await fresh();
      const actions = index % 2 ? [service.logout(family.token), service.refresh(family.token)]
        : [service.refresh(family.token), service.logout(family.token)];
      const results = await Promise.allSettled(actions);
      expect(results.some(result => result.status === 'fulfilled')).toBe(true);
      expect(await db.refreshSession.count({ where: { familyId: family.familyId, revokedAt: null } })).toBe(0);
    }
  });

  it('replay rejection commits the family revocation instead of rolling it back', async () => {
    const family = await fresh();
    const rotated = await service.refresh(family.token);
    await expect(service.refresh(family.token)).rejects.toThrow('Обнаружено повторное использование');
    expect(await db.refreshSession.count({ where: { familyId: family.familyId, revokedAt: null } })).toBe(0);
    await expect(service.refresh(rotated.refreshToken)).rejects.toThrow();
  });

  it('current-device presentation never exposes token hashes or marks another family', async () => {
    const current = await fresh(), other = await fresh();
    const sessions = await service.listMySessions(userId, current.token);
    expect(sessions.filter(session => 'isCurrent' in session && session.isCurrent === true)).toHaveLength(1);
    expect(JSON.stringify(sessions)).not.toContain(hash(current.token));
    const otherRow = await db.refreshSession.findUniqueOrThrow({ where: { tokenHash: hash(other.token) } });
    expect(sessions.find(session => session.id === otherRow.id)).not.toHaveProperty('isCurrent');
    expect((await service.listMySessions(userId, randomBytes(32).toString('hex'))).some(session => 'isCurrent' in session)).toBe(false);
  });
});
