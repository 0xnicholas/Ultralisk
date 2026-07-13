import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/models', async (_req: Request, res: Response) => {
  const { rows } = await pool.query("SELECT * FROM models WHERE status = 'active'");
  res.json({ data: rows, pagination: { page: 1, limit: 20, total: rows.length } });
});

router.get('/models/:id', async (req: Request, res: Response) => {
  const { rows } = await pool.query('SELECT * FROM models WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'not_found' });
  res.json({ data: rows[0] });
});

export default router;
