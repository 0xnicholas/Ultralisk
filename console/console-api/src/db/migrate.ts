import pool from '../db/index.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function migrate(): Promise<void> {
  const sql002 = readFileSync(join(__dirname, '../../drizzle/002_phase1_tables.sql'), 'utf-8');
  for (const stmt of sql002.split(';').map(s => s.trim()).filter(s => s.length > 0)) {
    await pool.query(stmt);
  }
  console.log('Phase 1 tables migration applied');

  const sql003 = readFileSync(join(__dirname, '../../drizzle/003_phase2_tables.sql'), 'utf-8');
  for (const stmt of sql003.split(';').map(s => s.trim()).filter(s => s.length > 0)) {
    await pool.query(stmt);
  }
  console.log('Phase 2 tables migration applied');

  const sql004 = readFileSync(join(__dirname, '../../drizzle/004_reserved_strategy.sql'), 'utf-8');
  for (const stmt of sql004.split(';').map(s => s.trim()).filter(s => s.length > 0)) {
    await pool.query(stmt);
  }
  console.log('Reserved strategy migration applied');
}
