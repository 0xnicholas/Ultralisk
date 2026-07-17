import pool from '../db/index.js';
import { logger } from '../logger.js';

// ADR-006 / Phase 1 M2: T-2 aggregation window.
// Runs hourly, aggregates raw_usage_events from the hour-before-last
// into billing_summary, per org per month.
// Uses the hour-before-last to avoid missing late final responses.

const CRON_LOCK_KEY = 0x75_73_61_67_65; // arbitrary 32-bit int
let cronOwner = false;

async function tryAcquireLock(client: any): Promise<boolean> {
  const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS got', [CRON_LOCK_KEY]);
  return rows[0]?.got === true;
}

export async function aggregateUsage(): Promise<void> {
  if (!cronOwner) {
    const client = await pool.connect();
    try {
      cronOwner = await tryAcquireLock(client);
    } finally {
      client.release();
    }
    if (!cronOwner) {
      // another instance already owns the cron for this DB
      return;
    }
  }
  const now = new Date();
  // T-2: hour-before-last
  const windowEnd = new Date(now);
  windowEnd.setMinutes(0, 0, 0);
  const windowStart = new Date(windowEnd.getTime() - 3600000); // 1 hour before

  const startIso = windowStart.toISOString().replace('T', ' ').substring(0, 19);
  const endIso = windowEnd.toISOString().replace('T', ' ').substring(0, 19);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if this window was already aggregated
    const { rows: existing } = await client.query(
      "SELECT id FROM usage_aggregation_log WHERE window_start = $1 AND window_end = $2",
      [startIso, endIso]
    );
    if (existing.length > 0) {
      logger.debug({ window: `${startIso}-${endIso}` }, 'usage aggregation already processed');
      await client.query('COMMIT');
      return;
    }

    // Aggregate raw_usage_events for the T-2 window
    const { rows: agg } = await client.query(
      `SELECT org_id, model_id::VARCHAR as model_id, year_month,
              SUM(prompt_tokens)::BIGINT as total_prompt_tokens,
              SUM(completion_tokens)::BIGINT as total_completion_tokens,
              COUNT(*)::INTEGER as request_count
       FROM (
         SELECT org_id, model_id,
                TO_CHAR(completed_at, 'YYYY-MM') as year_month,
                COALESCE(prompt_tokens, 0) as prompt_tokens,
                COALESCE(completion_tokens, 0) as completion_tokens
         FROM raw_usage_events
         WHERE completed_at >= $1 AND completed_at < $2
           AND status = 'completed'
       ) sub
       GROUP BY org_id, model_id, year_month`,
      [startIso, endIso]
    );

    // Upsert into billing_summary by (org_id, year_month, model_id)
    let rowsAgg = 0;
    for (const row of agg) {
      const totalTokens = (row.total_prompt_tokens || 0) + (row.total_completion_tokens || 0);
      const inputCost = (row.total_prompt_tokens || 0) / 1000 * 0.00006; // default $0.06/1M tokens
      const outputCost = (row.total_completion_tokens || 0) / 1000 * 0.00006;

      await client.query(
        `INSERT INTO billing_summary (org_id, year_month, model_id, total_tokens, total_cost)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (org_id, year_month, model_id) DO UPDATE SET
           total_tokens = billing_summary.total_tokens + EXCLUDED.total_tokens,
           total_cost = billing_summary.total_cost + EXCLUDED.total_cost`,
        [row.org_id, row.year_month, row.model_id, totalTokens, inputCost + outputCost]
      );
      rowsAgg++;
    }

    // Record aggregation run
    await client.query(
      'INSERT INTO usage_aggregation_log (window_start, window_end, status, rows_agg) VALUES ($1, $2, $3, $4)',
      [startIso, endIso, 'completed', rowsAgg]
    );

    await client.query('COMMIT');
    logger.info({ window: `[${startIso}, ${endIso})`, rows: rowsAgg }, 'usage aggregation done');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err }, 'usage aggregation failed');
  } finally {
    client.release();
  }
}

let cronStarted = false;

export function startUsageCron(): void {
  if (cronStarted) return;
  cronStarted = true;

  // Run on startup (slight delay to let DB pool warm up)
  setTimeout(() => aggregateUsage().catch((err) => logger.error({ err }, 'cron start failed')), 5000);

  // Run every hour. Multiple console-api instances (e.g. during tsx restarts)
  // are deduped via the PG advisory lock inside aggregateUsage().
  const timer = setInterval(() => aggregateUsage().catch((err) => logger.error({ err }, 'cron tick failed')), 3600000);
  timer.unref();

  // Release the lock on shutdown so a fresh process can take over immediately.
  const release = async () => {
    if (cronOwner) {
      try {
        await pool.query('SELECT pg_advisory_unlock($1)', [CRON_LOCK_KEY]);
      } catch { /* ignore */ }
      cronOwner = false;
    }
  };
  process.once('SIGINT', () => { release(); process.exit(0); });
  process.once('SIGTERM', () => { release(); process.exit(0); });
}
