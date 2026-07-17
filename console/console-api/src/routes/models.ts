import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

function normalizeModel(row: any) {
  const caps = Array.isArray(row.capabilities) ? row.capabilities : [];
  const has = (s: string) => caps.includes(s);
  return {
    id: row.id,
    display_name: row.name,
    author: row.provider,
    category: 'chat',
    description: row.description ?? '',
    status: row.status === 'active' ? 'available' : 'unavailable',
    capabilities: {
      context_window: row.context_length ?? 4096,
      max_output_tokens: Math.min(row.context_length ?? 4096, 4096),
      json_mode: has('json_mode'),
      tool_calling: has('tool_calling'),
      multi_modal: has('multi_modal'),
      fine_tuning: has('fine_tuning'),
    },
    pricing: {
      serverless: {
        input_per_1m_tokens: Number(row.pricing_per_1k_input ?? 0) * 1000,
        output_per_1m_tokens: Number(row.pricing_per_1k_output ?? 0) * 1000,
        cached_input_per_1m_tokens: 0,
      },
      batch_discount_percent: 50,
      dedicated: null,
    },
  };
}

router.get('/models', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query("SELECT * FROM models WHERE status = 'active'");
    const data = rows.map(normalizeModel);
    res.json({ data, pagination: { page: 1, limit: 20, total: data.length } });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

router.get('/models/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM models WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: { code: 'not_found', message: 'Model not found' } });
    res.json({ data: normalizeModel(rows[0]) });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

export default router;
