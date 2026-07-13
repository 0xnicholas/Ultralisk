import pool from '../db/index.js';

// ADR-006 / Phase 1 M2: T-2 aggregation window.
// Runs hourly, aggregates raw_usage_events from the hour-before-last
// into billing_summary, per org per month.
// Uses the hour-before-last to avoid missing late final responses.

export async function aggregateUsage(): Promise<void> {
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
      console.log(`Usage aggregation window ${startIso}-${endIso} already processed, skipping`);
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
    console.log(`Usage aggregation T-2 [${startIso}, ${endIso}) done: ${rowsAgg} rows`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Usage aggregation failed:', err);
  } finally {
    client.release();
  }
}

// Start hourly cron
export function startUsageCron(): void {
  // Run on startup
  setTimeout(() => aggregateUsage().catch(console.error), 5000);

  // Run every hour (at :05 to ensure late events from T-2 are in)
  setInterval(() => aggregateUsage().catch(console.error), 3600000);
}
