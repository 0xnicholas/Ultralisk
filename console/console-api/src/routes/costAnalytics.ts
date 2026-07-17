import { Router, Request, Response } from 'express';
import pool from '../db/index.js';

const router = Router();

const DIMENSIONS = ['model', 'endpoint', 'api_key', 'team'] as const;

router.get('/cost-analytics', async (_req: Request, res: Response) => {
  try {
    const orgId = _req.headers['x-org-id'] as string || '00000000-0000-0000-0000-000000000001';

    const { rows: summaryRows } = await pool.query(`
      SELECT
        COALESCE(SUM(cost_usd), 0) AS total_cost_usd,
        COALESCE(SUM(CASE WHEN dimension = 'model' THEN cost_usd ELSE 0 END), 0) AS token_cost_usd,
        COALESCE(SUM(gpu_hours) * 2.5, 0) AS gpu_hour_cost_usd
      FROM cost_data
      WHERE org_id = $1 AND recorded_at > NOW() - INTERVAL '30 days'
    `, [orgId]);

    const totalCost = Number(summaryRows[0].total_cost_usd);
    const tokenCost = Number(summaryRows[0].token_cost_usd);
    const gpuCost = Number(summaryRows[0].gpu_hour_cost_usd);

    // Load budget settings from DB (fallback to defaults if not configured)
    const { rows: settingsRows } = await pool.query(
      'SELECT budget_usd, alerts_enabled, channels, suppression_window_minutes, thresholds FROM budget_alert_settings WHERE org_id = $1',
      [orgId]
    );
    const settings = settingsRows[0] || {};
    const budgetUsd = Number(settings.budget_usd) || 25000;
    const budgetUsedPct = Math.round((totalCost / budgetUsd) * 100 * 10) / 10;
    const estimatedMonthEnd = Math.round(totalCost / 30 * 31 * 100) / 100;

    const byDimension: Record<string, any[]> = {};
    for (const dim of DIMENSIONS) {
      const { rows } = await pool.query(`
        SELECT
          dimension_name AS name,
          SUM(cost_usd) AS cost_usd,
          SUM(gpu_hours) AS gpu_hours,
          SUM(tokens_m) AS tokens_m
        FROM cost_data
        WHERE org_id = $1 AND dimension = $2 AND recorded_at > NOW() - INTERVAL '30 days'
        GROUP BY dimension_name
        ORDER BY cost_usd DESC
      `, [orgId, dim]);

      const dimTotal = rows.reduce((s: number, r: any) => s + Number(r.cost_usd), 0);
      byDimension[dim] = rows.map((r: any) => ({
        name: r.name,
        cost_usd: Math.round(Number(r.cost_usd) * 100) / 100,
        gpu_hours: Math.round(Number(r.gpu_hours) * 10) / 10,
        tokens_m: Math.round(Number(r.tokens_m) * 10) / 10,
        pct: dimTotal > 0 ? Math.round((Number(r.cost_usd) / dimTotal) * 100 * 10) / 10 : 0,
      }));
    }

    const { rows: dailyTrend } = await pool.query(`
      SELECT
        recorded_at AS date,
        COALESCE(SUM(cost_usd) FILTER (WHERE dimension = 'model'), 0) AS token_cost,
        COALESCE(SUM(gpu_hours) * 2.5, 0) AS gpu_cost
      FROM cost_data
      WHERE org_id = $1 AND recorded_at > NOW() - INTERVAL '30 days'
      GROUP BY recorded_at
      ORDER BY recorded_at
    `, [orgId]);

    res.json({
      data: {
        summary: {
          total_cost_usd: totalCost,
          token_cost_usd: tokenCost,
          gpu_hour_cost_usd: Math.round(gpuCost * 100) / 100,
          budget_usd: budgetUsd,
          budget_used_pct: budgetUsedPct,
          estimated_month_end_usd: estimatedMonthEnd,
        },
        by_dimension: byDimension,
        daily_cost_trend: dailyTrend.map((r: any) => ({
          date: r.date.toISOString().slice(0, 10),
          token_cost: Math.round(Number(r.token_cost) * 100) / 100,
          gpu_cost: Math.round(Number(r.gpu_cost) * 100) / 100,
        })),
        budget_alerts: {
          budget_usd: budgetUsd,
          current_spend: totalCost,
          alerts_enabled: settings.alerts_enabled !== false,
          channels: settings.channels || ['email'],
          thresholds: (settings.thresholds || [
            { label: '70% warning', type: 'percent', value: 70 },
            { label: '90% critical', type: 'percent', value: 90 },
            { label: 'GPU utilization >85%', type: 'gpu_util', value: 85 },
          ]).map((t: any) => ({
            label: t.label,
            type: t.type,
            value: t.value,
            triggered: t.type === 'percent'
              ? budgetUsedPct >= t.value
              : t.type === 'gpu_util'
                ? false  // real-time check via cron
                : false,
            triggered_at: (t.type === 'percent' && budgetUsedPct >= t.value)
              ? new Date().toISOString()
              : undefined,
          })),
          suppression_window_minutes: settings.suppression_window_minutes || 30,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

export default router;
