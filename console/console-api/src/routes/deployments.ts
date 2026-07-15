import { Router, Request, Response } from 'express';
import pool from '../db/index.js';

const router = Router();

router.get('/deployments', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });

    const { rows } = await pool.query(
      'SELECT * FROM deployments WHERE user_id = $1 ORDER BY created_at DESC', [userId]
    );
    res.json({ data: rows.map(mapDeployment), pagination: { page: 1, limit: 20, total: rows.length } });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

router.get('/deployments/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });

    const { rows: [dep] } = await pool.query(
      'SELECT * FROM deployments WHERE id = $1 AND user_id = $2', [req.params.id, userId]
    );
    if (!dep) return res.status(404).json({ error: { code: 'not_found', message: 'Deployment not found' } });

    const { rows: versions } = await pool.query(
      'SELECT * FROM deployment_versions WHERE deployment_id = $1 ORDER BY version DESC', [req.params.id]
    );

    res.json({ data: { ...mapDeployment(dep), versions: versions.map(mapVersion) } });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

router.post('/deployments/:id/scale', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });

    const replicas = req.body?.replicas;
    if (!replicas || typeof replicas !== 'number' || replicas < 1) {
      return res.status(400).json({ error: { code: 'invalid_request', message: 'replicas must be a positive integer' } });
    }

    const { rows: [dep] } = await pool.query(
      'UPDATE deployments SET replicas = $3 WHERE id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, userId, replicas]
    );
    if (!dep) return res.status(404).json({ error: { code: 'not_found', message: 'Deployment not found' } });

    res.json({ data: mapDeployment(dep) });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

router.post('/deployments/:id/rollback', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });

    const { rows: [dep] } = await pool.query(
      'SELECT * FROM deployments WHERE id = $1 AND user_id = $2', [req.params.id, userId]
    );
    if (!dep) return res.status(404).json({ error: { code: 'not_found', message: 'Deployment not found' } });

    await pool.query(
      'UPDATE deployments SET status = $3 WHERE id = $1 AND user_id = $2',
      [req.params.id, userId, 'rolling_back']
    );

    res.json({ data: { ...mapDeployment(dep), status: 'rolling_back' } });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

function mapDeployment(r: any) {
  return {
    id: r.id,
    name: r.name,
    model_id: r.model_id,
    endpoint_id: r.endpoint_id,
    cluster_id: r.cluster_id,
    replicas: r.replicas,
    gpu_per_replica: r.gpu_per_replica,
    status: r.status,
    created_at: r.created_at,
  };
}

function mapVersion(r: any) {
  return {
    version: r.version,
    image: r.image,
    status: r.status,
    deployed_at: r.deployed_at,
  };
}

export default router;
