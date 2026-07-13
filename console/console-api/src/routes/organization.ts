import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/organization', async (req: Request, res: Response) => {
  try {
    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });
    const { rows } = await pool.query('SELECT * FROM orgs WHERE id = $1', [orgId]);
    if (!rows[0]) return res.status(404).json({ error: { code: 'not_found', message: 'Organization not found' } });
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

export default router;
