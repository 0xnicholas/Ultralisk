import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/endpoints', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });
    const { rows } = await pool.query(
      'SELECT id, name, model_id, type, replicas, gpu_type, gpu_count, autoscaling_policy, status, created_at FROM endpoints WHERE user_id = $1 ORDER BY created_at DESC', [userId]
    );
    res.json({ data: rows.map((r: any) => mapEndpoint(r)), pagination: { page: 1, limit: 20, total: rows.length } });
  } catch (err) { res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } }); }
});

router.get('/endpoints/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });
    const { rows: [ep] } = await pool.query(
      'SELECT id, name, model_id, type, replicas, gpu_type, gpu_count, autoscaling_policy, status, created_at FROM endpoints WHERE id = $1 AND user_id = $2', [req.params.id, userId]
    );
    if (!ep) return res.status(404).json({ error: { code: 'not_found', message: 'Endpoint not found' } });
    res.json({ data: mapEndpoint(ep) });
  } catch (err) { res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } }); }
});

router.post('/endpoints', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const orgId = req.headers['x-org-id'] as string;
    if (!userId || !orgId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });
    const { name, model_id, type, replicas, gpu_type, gpu_count, autoscaling_policy } = req.body;
    const { rows: [ep] } = await pool.query(
      `INSERT INTO endpoints (user_id, org_id, name, model_id, type, replicas, gpu_type, gpu_count, autoscaling_policy)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, name, model_id, type, replicas, gpu_type, gpu_count, autoscaling_policy, status, created_at`,
      [userId, orgId, name, model_id, type ?? 'serverless', replicas ?? 1, gpu_type ?? 'H100', gpu_count ?? 1, autoscaling_policy ? JSON.stringify(autoscaling_policy) : null]
    );
    res.status(201).json({ data: mapEndpoint(ep) });
  } catch (err) { res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } }); }
});

router.patch('/endpoints/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });
    const { name, replicas, autoscaling_policy } = req.body;
    const { rows: [ep] } = await pool.query(
      `UPDATE endpoints SET name = COALESCE($3, name), replicas = COALESCE($4, replicas), autoscaling_policy = COALESCE($5::jsonb, autoscaling_policy)
       WHERE id = $1 AND user_id = $2 RETURNING id, name, model_id, type, replicas, gpu_type, gpu_count, autoscaling_policy, status, created_at`,
      [req.params.id, userId, name ?? null, replicas ?? null, autoscaling_policy ? JSON.stringify(autoscaling_policy) : null]
    );
    if (!ep) return res.status(404).json({ error: { code: 'not_found', message: 'Endpoint not found' } });
    res.json({ data: mapEndpoint(ep) });
  } catch (err) { res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } }); }
});

router.delete('/endpoints/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });
    const result = await pool.query('DELETE FROM endpoints WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
    if (result.rowCount === 0) return res.status(404).send();
    res.status(204).send();
  } catch (err) { res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } }); }
});

function mapEndpoint(r: any) {
  return {
    id: r.id, name: r.name, model_id: r.model_id, type: r.type, replicas: r.replicas,
    gpu_spec: { type: r.gpu_type, count: r.gpu_count },
    autoscaling_policy: r.autoscaling_policy,
    metrics: { qps: 0, ttft_p95_ms: 0, tpot_ms: 0, error_rate: 0, gpu_util: 0 },
    status: r.status, created_at: r.created_at,
  };
}

export default router;
