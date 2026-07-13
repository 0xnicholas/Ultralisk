import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/batch-jobs', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });
    const { rows } = await pool.query(
      'SELECT id, name, model_id, status, input_file, output_file, callback_url, token_count, cost, created_at, completed_at, error_log FROM batch_jobs WHERE user_id = $1 ORDER BY created_at DESC', [userId]
    );
    res.json({ data: rows.map(mapJob), pagination: { page: 1, limit: 20, total: rows.length } });
  } catch (err) { res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } }); }
});

router.get('/batch-jobs/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });
    const { rows: [job] } = await pool.query(
      'SELECT id, name, model_id, status, input_file, output_file, callback_url, token_count, cost, created_at, completed_at, error_log FROM batch_jobs WHERE id = $1 AND user_id = $2', [req.params.id, userId]
    );
    if (!job) return res.status(404).json({ error: { code: 'not_found', message: 'Batch job not found' } });
    res.json({ data: mapJob(job) });
  } catch (err) { res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } }); }
});

router.post('/batch-jobs', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const orgId = req.headers['x-org-id'] as string;
    if (!userId || !orgId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });
    const { name, model_id, input_file, callback_url } = req.body;
    const { rows: [job] } = await pool.query(
      `INSERT INTO batch_jobs (user_id, org_id, name, model_id, input_file, callback_url)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, model_id, status, input_file, output_file, callback_url, token_count, cost, created_at, completed_at, error_log`,
      [userId, orgId, name, model_id, input_file, callback_url ?? null]
    );
    res.status(201).json({ data: mapJob(job) });
  } catch (err) { res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } }); }
});

router.delete('/batch-jobs/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });
    const result = await pool.query('DELETE FROM batch_jobs WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
    if (result.rowCount === 0) return res.status(404).send();
    res.status(204).send();
  } catch (err) { res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } }); }
});

function mapJob(r: any) {
  return {
    id: r.id, name: r.name, model_id: r.model_id, status: r.status,
    input_file: r.input_file, output_file: r.output_file, callback_url: r.callback_url,
    token_count: r.token_count, cost: r.cost,
    created_at: r.created_at, completed_at: r.completed_at, error_log: r.error_log,
  };
}

export default router;
