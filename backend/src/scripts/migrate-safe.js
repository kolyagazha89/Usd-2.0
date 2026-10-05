const { Client } = require('pg');
const { spawnSync } = require('node:child_process');

const RECOVERABLE_MIGRATION = '20261005160000_site_settings';

function runPrisma(args) {
  const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prisma', ...args], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT migration_name
       FROM "_prisma_migrations"
       WHERE finished_at IS NULL
         AND rolled_back_at IS NULL
       ORDER BY started_at DESC`,
    );
    if (result.rows.some((row) => row.migration_name === RECOVERABLE_MIGRATION)) {
      console.log('[migrate-safe] repairing failed site settings migration');
      await client.query(`
        CREATE TABLE IF NOT EXISTS "SiteSettings" (
          "id" TEXT NOT NULL,
          "branding" JSONB NOT NULL DEFAULT '{}'::jsonb,
          "homepage" JSONB NOT NULL DEFAULT '{}'::jsonb,
          "stream" JSONB NOT NULL DEFAULT '{}'::jsonb,
          "liveResults" JSONB NOT NULL DEFAULT '{}'::jsonb,
          "navigation" JSONB NOT NULL DEFAULT '{}'::jsonb,
          "contacts" JSONB NOT NULL DEFAULT '{}'::jsonb,
          "social" JSONB NOT NULL DEFAULT '{}'::jsonb,
          "seo" JSONB NOT NULL DEFAULT '{}'::jsonb,
          "legal" JSONB NOT NULL DEFAULT '{}'::jsonb,
          "footer" JSONB NOT NULL DEFAULT '{}'::jsonb,
          "registration" JSONB NOT NULL DEFAULT '{}'::jsonb,
          "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
        );
      `);
      const columns = [
        ['branding', `JSONB NOT NULL DEFAULT '{}'::jsonb`],
        ['homepage', `JSONB NOT NULL DEFAULT '{}'::jsonb`],
        ['stream', `JSONB NOT NULL DEFAULT '{}'::jsonb`],
        ['liveResults', `JSONB NOT NULL DEFAULT '{}'::jsonb`],
        ['navigation', `JSONB NOT NULL DEFAULT '{}'::jsonb`],
        ['contacts', `JSONB NOT NULL DEFAULT '{}'::jsonb`],
        ['social', `JSONB NOT NULL DEFAULT '{}'::jsonb`],
        ['seo', `JSONB NOT NULL DEFAULT '{}'::jsonb`],
        ['legal', `JSONB NOT NULL DEFAULT '{}'::jsonb`],
        ['footer', `JSONB NOT NULL DEFAULT '{}'::jsonb`],
        ['registration', `JSONB NOT NULL DEFAULT '{}'::jsonb`],
        ['updatedAt', `TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`],
        ['createdAt', `TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`],
      ];
      for (const [name, definition] of columns) {
        await client.query(`ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "${name}" ${definition}`);
      }
      await client.query(
        `UPDATE "_prisma_migrations"
         SET finished_at = COALESCE(finished_at, NOW()),
             rolled_back_at = NULL,
             applied_steps_count = 1
         WHERE migration_name = $1
           AND finished_at IS NULL`,
        [RECOVERABLE_MIGRATION],
      );
    }
  } finally {
    await client.end();
  }
  runPrisma(['migrate', 'deploy']);
}

main().catch((error) => {
  console.error('[migrate-safe] database migration bootstrap failed');
  console.error(error);
  process.exit(1);
});
