import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../db/index.js';

const router = Router();

const DEPLOYMENT_MODE = (process.env.DEPLOYMENT_MODE || 'saas') as 'saas' | 'private';

function getOrgId(req: Request): string {
  return (req.headers['x-org-id'] as string) || '00000000-0000-0000-0000-000000000001';
}

router.get('/models/registry', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM model_registry WHERE org_id = $1 ORDER BY created_at DESC',
      [getOrgId(req)]
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

router.get('/models/registry/:id', async (req: Request, res: Response) => {
  try {
    const { rows: [entry] } = await pool.query(
      'SELECT * FROM model_registry WHERE id = $1 AND org_id = $2',
      [req.params.id, getOrgId(req)]
    );
    if (!entry) return res.status(404).json({ error: { code: 'not_found', message: 'Registry entry not found' } });
    res.json({ data: entry });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

router.post('/models/registry/import', async (req: Request, res: Response) => {
  try {
    const { name, source_type, source_path } = req.body;
    if (!name || !source_type || !source_path) {
      return res.status(400).json({ error: { code: 'invalid_request', message: 'name, source_type, and source_path are required' } });
    }

    const validTypes = ['hf', 's3', 'minio', 'upload'];
    if (!validTypes.includes(source_type)) {
      return res.status(400).json({ error: { code: 'invalid_source_type', message: `source_type must be one of: ${validTypes.join(', ')}` } });
    }

    const { rows: [entry] } = await pool.query(
      `INSERT INTO model_registry (org_id, name, source_type, source_path, status)
       VALUES ($1, $2, $3, $4, 'importing') RETURNING *`,
      [getOrgId(req), name, source_type, source_path]
    );

    // Simulate async import (real implementation would trigger a background job)
    setTimeout(async () => {
      const modelId = 'custom-' + name.toLowerCase().replace(/[^a-z0-9-]/g, '-') + '-' + crypto.randomBytes(4).toString('hex');
      await pool.query(
        `INSERT INTO models (id, name, provider, description, status, context_length, pricing_per_1k_input, pricing_per_1k_output, capabilities)
         VALUES ($1, $2, 'Custom', $3, 'active', 4096, '0', '0', $4)
         ON CONFLICT DO NOTHING`,
        [modelId, name, `Imported from ${source_type}: ${source_path}`, JSON.stringify(['chat'])]
      );
      await pool.query(
        'UPDATE model_registry SET status = $1, model_id = $2, ready_at = NOW() WHERE id = $3',
        ['ready', modelId, entry.id]
      );
    }, 3000);

    res.status(201).json({ data: entry });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

router.delete('/models/registry/:id', async (req: Request, res: Response) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM model_registry WHERE id = $1 AND org_id = $2',
      [req.params.id, getOrgId(req)]
    );
    if (rowCount === 0) return res.status(404).json({ error: { code: 'not_found', message: 'Registry entry not found' } });
    res.json({ data: { ok: true } });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

export default router;
