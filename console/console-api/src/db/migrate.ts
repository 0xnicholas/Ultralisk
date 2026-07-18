import pool from '../db/index.js';
import { logger } from '../logger.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inDollarString = false;
  let dollarTag = '';
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    if (!inDollarString && ch === '$' && i + 1 < sql.length && sql[i + 1] === '$') {
      // Start of $$ string
      inDollarString = true;
      dollarTag = '$$';
      current += '$$';
      i += 2;
      continue;
    }

    if (inDollarString && dollarTag === '$$' && ch === '$' && i + 1 < sql.length && sql[i + 1] === '$') {
      // End of $$ string
      inDollarString = false;
      dollarTag = '';
      current += '$$';
      i += 2;
      continue;
    }

    // Handle $tag$ strings
    if (!inDollarString && ch === '$') {
      const tagStart = i + 1;
      let tagEnd = tagStart;
      while (tagEnd < sql.length && /[a-zA-Z0-9_]/.test(sql[tagEnd])) tagEnd++;
      if (sql[tagEnd] === '$' && tagEnd > tagStart) {
        const tag = sql.slice(tagStart, tagEnd);
        inDollarString = true;
        dollarTag = '$' + tag + '$';
        current += dollarTag;
        i = tagEnd + 1;
        continue;
      }
    }

    if (inDollarString) {
      const lookahead = sql.slice(i, i + dollarTag.length);
      if (lookahead === dollarTag) {
        inDollarString = false;
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = '';
        continue;
      }
      current += ch;
      i++;
      continue;
    }

    if (ch === ';') {
      const trimmed = current.trim();
      if (trimmed.length > 0) statements.push(trimmed);
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  const trimmed = current.trim();
  if (trimmed.length > 0) statements.push(trimmed);

  return statements;
}

const MIGRATIONS: Array<{ file: string; label: string }> = [
  { file: '001_console.sql',           label: 'Console base tables' },
  { file: '002_phase1_tables.sql',     label: 'Phase 1 tables' },
  { file: '003_phase2_tables.sql',     label: 'Phase 2 tables' },
  { file: '004_reserved_strategy.sql', label: 'Reserved strategy' },
  { file: '005_phase2_dev_metrics.sql',label: 'Phase 2 dev metrics' },
  { file: '006_model_registry.sql',    label: 'Model registry' },
  { file: '007_audit_logs.sql',        label: 'Audit logs' },
  { file: '008_budget_alerts.sql',    label: 'Budget alerts' },
  { file: '009_billing_email.sql',   label: 'Billing email column' },
  { file: '010_alert_fingerprint.sql', label: 'Alert fingerprint + org_id' },
];

async function ensureMigrationTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(64) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedVersions(): Promise<Set<string>> {
  const { rows } = await pool.query('SELECT version FROM schema_migrations');
  return new Set(rows.map((r: any) => r.version));
}

async function runMigration(version: string, label: string, path: string): Promise<void> {
  const sql = readFileSync(join(__dirname, '../../drizzle/', path), 'utf-8');
  const statements = splitSqlStatements(sql);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const stmt of statements) {
      await client.query(stmt);
    }
    await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
    await client.query('COMMIT');
    logger.info({ version, label }, 'migration applied');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function migrate(): Promise<void> {
  await ensureMigrationTable();
  const done = await appliedVersions();
  for (const m of MIGRATIONS) {
    if (done.has(m.file)) continue;
    await runMigration(m.file, m.label, m.file);
  }
}
