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
      console.log('[migrate-safe] rolling back failed site settings migration metadata');
      await client.query(
        `UPDATE "_prisma_migrations"
         SET rolled_back_at = NOW()
         WHERE migration_name = $1
           AND finished_at IS NULL
           AND rolled_back_at IS NULL`,
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
