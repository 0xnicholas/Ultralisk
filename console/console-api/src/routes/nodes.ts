import { Router, Request, Response } from 'express';
import pool from '../db/index.js';

const router = Router();

router.get('/nodes', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM nodes ORDER BY hostname');
    res.json({ data: rows.map(mapNode), pagination: { page: 1, limit: 50, total: rows.length } });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

router.get('/nodes/:id', async (req: Request, res: Response) => {
  try {
    const { rows: [node] } = await pool.query('SELECT * FROM nodes WHERE id = $1', [req.params.id]);
    if (!node) return res.status(404).json({ error: { code: 'not_found', message: 'Node not found' } });

    const { rows: cards } = await pool.query('SELECT * FROM gpu_cards WHERE node_id = $1 ORDER BY card_index', [req.params.id]);
    res.json({ data: { ...mapNode(node), gpu_cards: cards.map(mapGpuCard) } });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

router.get('/clusters/:clusterId/nodes/:nodeId', async (req: Request, res: Response) => {
  try {
    const { rows: [node] } = await pool.query(
      'SELECT * FROM nodes WHERE id = $1 AND cluster_id = $2', [req.params.nodeId, req.params.clusterId]
    );
    if (!node) return res.status(404).json({ error: { code: 'not_found', message: 'Node not found' } });

    const { rows: cards } = await pool.query('SELECT * FROM gpu_cards WHERE node_id = $1 ORDER BY card_index', [req.params.nodeId]);
    res.json({ data: { ...mapNode(node), gpu_cards: cards.map(mapGpuCard) } });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

function mapNode(r: any) {
  return {
    id: r.id,
    cluster_id: r.cluster_id,
    hostname: r.hostname,
    gpu_model: r.gpu_model,
    gpu_count: r.gpu_count,
    driver_version: r.driver_version,
    cuda_version: r.cuda_version,
    status: r.status,
    created_at: r.created_at,
  };
}

function mapGpuCard(r: any) {
  return {
    id: r.id,
    node_id: r.node_id,
    index: r.card_index,
    memory_mb: r.memory_mb,
    created_at: r.created_at,
  };
}

export default router;
