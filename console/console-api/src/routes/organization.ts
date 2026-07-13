import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/organization', async (req: Request, res: Response) => {
  const orgId = req.headers['x-org-id'] as string;
  if (!orgId) return res.status(401).json({ error: 'unauthorized' });
  const { rows } = await pool.query('SELECT * FROM orgs WHERE id = $1', [orgId]);
  if (!rows[0]) return res.status(404).json({ error: 'not_found' });
  res.json({ data: rows[0] });
});

export default router;
