import { Router, Request, Response } from 'express';
import pool from '../db';
import { normalizeModel } from './modelShaping.js';

const router = Router();

router.get('/models', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query("SELECT * FROM models WHERE status = 'active'");
    const data = rows.map(normalizeModel);
    res.json({ data, pagination: { page: 1, limit: 20, total: data.length } });
  } catch (err) {
    console.error('[models] list error:', err);
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

router.get('/models/:id', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM models WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: { code: 'not_found', message: 'Model not found' } });
    res.json({ data: normalizeModel(rows[0]) });
  } catch (err) {
    console.error('[models] detail error for id', req.params.id, ':', err);
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

export default router;
