import { Router, Request, Response } from 'express';
import pool from '../db/index.js';

const router = Router();

router.get('/alerts', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM alerts ORDER BY fired_at DESC NULLS LAST');
    res.json({ data: rows, pagination: { page: 1, limit: 20, total: rows.length } });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

router.post('/alerts/:id/suppress', async (req: Request, res: Response) => {
  try {
    const { rows: [alert] } = await pool.query(
      'UPDATE alerts SET status = $2 WHERE id = $1 RETURNING *', [req.params.id, 'suppressed']
    );
    if (!alert) return res.status(404).json({ error: { code: 'not_found', message: 'Alert not found' } });
    res.json({ data: alert });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

export default router;
