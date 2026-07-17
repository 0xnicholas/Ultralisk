/**
 * ClickHouse migration runner.
 *
 * Reads .sql files from drizzle/clickhouse/ and applies them in order.
 * Migration state is tracked in ultralisk.schema_migrations.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../logger.js';
import { client } from './clickhouseClient.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '../../drizzle/clickhouse');

const MIGRATIONS = [
  { file: '001_gpu_metrics.sql', label: 'GPU metric snapshots + hourly MV' },
  { file: '002_usage_events.sql', label: 'Usage events + hourly MV' },
  { file: '003_cost_data.sql',    label: 'Cost data + monthly MV' },
];

async function ensureMigrationTable(): Promise<void> {
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ultralisk.schema_migrations (
        version       String,
        applied_at    DateTime DEFAULT now()
      ) ENGINE = MergeTree()
      ORDER BY version
    `);
  } catch (err) {
    // If ClickHouse is not available, migrations are skipped silently
    logger.debug({ err }, 'ClickHouse migration table setup skipped (CH unavailable)');
  }
}

export async function migrateClickHouse(): Promise<void> {
  if (!client.isConnected()) {
    logger.info('ClickHouse not connected; skipping CH migrations');
    return;
  }

  await ensureMigrationTable();

  const { rows } = await client.query(
    'SELECT version FROM ultralisk.schema_migrations ORDER BY version'
  );
  const done = new Set(rows.map((r: any) => r.version));

  for (const m of MIGRATIONS) {
    if (done.has(m.file)) continue;

    const path = join(MIGRATIONS_DIR, m.file);
    let sql: string;
    try {
      sql = readFileSync(path, 'utf-8');
    } catch {
      logger.warn({ file: m.file }, 'ClickHouse migration file not found');
      continue;
    }

    try {
      // ClickHouse SQL can contain multiple statements separated by ;
      // We send them one at a time
      const statements = sql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--'));

      for (const stmt of statements) {
        await client.query(stmt);
      }

      await client.query(
        `INSERT INTO ultralisk.schema_migrations (version) VALUES ('${m.file}')`
      );

      logger.info({ version: m.file, label: m.label }, 'ClickHouse migration applied');
    } catch (err) {
      logger.error({ err, version: m.file }, 'ClickHouse migration failed');
      // Don't stop the boot — CH migrations are non-critical
    }
  }
}
