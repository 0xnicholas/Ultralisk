import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

function rangeWindow(range: string): { days: number } {
  switch (range) {
    case 'today': return { days: 1 };
    case '7d': return { days: 7 };
    case '30d': return { days: 30 };
    case '90d': return { days: 90 };
    default: return { days: 7 };
  }
}

router.get('/usage', async (req: Request, res: Response) => {
  try {
    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });
    const { days } = rangeWindow((req.query.range as string) || 'today');
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const to = new Date().toISOString();
    const from = since;

    const { rows: totals } = await pool.query(
      `SELECT COUNT(*)::int AS requests,
              COALESCE(SUM(prompt_tokens), 0)::int AS input_tokens,
              COALESCE(SUM(completion_tokens), 0)::int AS output_tokens
       FROM raw_usage_events
       WHERE org_id = $1 AND started_at >= $2`,
      [orgId, since]
    );

    const { rows: byModel } = await pool.query(
      `SELECT model_id, COUNT(*)::int AS requests,
              COALESCE(SUM(prompt_tokens), 0)::int AS input_tokens,
              COALESCE(SUM(completion_tokens), 0)::int AS output_tokens
       FROM raw_usage_events
       WHERE org_id = $1 AND started_at >= $2
       GROUP BY model_id`,
      [orgId, since]
    );

    const { rows: byKey } = await pool.query(
      `SELECT api_key_id AS key_id, COUNT(*)::int AS requests,
              COALESCE(SUM(prompt_tokens), 0)::int AS input_tokens,
              COALESCE(SUM(completion_tokens), 0)::int AS output_tokens
       FROM raw_usage_events
       WHERE org_id = $1 AND started_at >= $2 AND api_key_id IS NOT NULL
       GROUP BY api_key_id`,
      [orgId, since]
    );

    const { rows: models } = await pool.query(
      "SELECT id, name, pricing_per_1k_input, pricing_per_1k_output FROM models WHERE status = 'active'"
    );
    const modelMap = new Map(models.map((m: any) => [m.id, m.name]));

    function calcCost(row: { prompt_tokens: number | string; completion_tokens: number | string }, modelId: string): number {
      const m: any = models.find((mm: any) => mm.id === modelId);
      if (!m) return 0;
      const inp = Number(row.prompt_tokens || 0) / 1000 * Number(m.pricing_per_1k_input);
      const out = Number(row.completion_tokens || 0) / 1000 * Number(m.pricing_per_1k_output);
      return inp + out;
    }

    const totalRow = totals[0] || { requests: 0, input_tokens: 0, output_tokens: 0 };
    const totalCost = (await pool.query(
      `SELECT model_id, COALESCE(SUM(prompt_tokens), 0)::int AS pt, COALESCE(SUM(completion_tokens), 0)::int AS ct
       FROM raw_usage_events WHERE org_id = $1 AND started_at >= $2 GROUP BY model_id`,
      [orgId, since]
    )).rows.reduce((acc: number, r: any) => acc + calcCost(r, r.model_id), 0);

    const { rows: recent } = await pool.query(
      `SELECT started_at AS timestamp, model_id, status, prompt_tokens, completion_tokens
       FROM raw_usage_events
       WHERE org_id = $1 AND started_at >= $2
       ORDER BY started_at DESC LIMIT 20`,
      [orgId, since]
    );

    res.json({
      data: {
        period: { from, to },
        totals: {
          requests: totalRow.requests,
          input_tokens: totalRow.input_tokens,
          output_tokens: totalRow.output_tokens,
          cost_usd: Math.round(totalCost * 1e6) / 1e6,
        },
        by_model: byModel.map((r: any) => ({
          model_id: r.model_id,
          model_display_name: modelMap.get(r.model_id) || r.model_id,
          requests: r.requests,
          input_tokens: r.input_tokens,
          output_tokens: r.output_tokens,
          cost_usd: Math.round(calcCost(r, r.model_id) * 1e6) / 1e6,
        })),
        by_key: byKey.map((r: any) => ({
          key_id: r.key_id,
          key_name: r.key_id,
          key_prefix: r.key_id,
          requests: r.requests,
          input_tokens: r.input_tokens,
          output_tokens: r.output_tokens,
          cost_usd: Math.round(calcCost(r, byModel.find((bm: any) => true)?.model_id || '') * 1e6) / 1e6,
        })),
        recent_activity: recent.map((r: any) => ({
          timestamp: r.timestamp,
          model_id: r.model_id,
          status_code: r.status === 'completed' ? 200 : 500,
          latency_ms: 0,
          tokens: Number(r.prompt_tokens || 0) + Number(r.completion_tokens || 0),
        })),
      },
    });
  } catch (err) {
    console.error('usage route error', err);
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

export default router;
