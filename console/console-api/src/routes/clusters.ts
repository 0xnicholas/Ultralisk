import { Router, Request, Response } from 'express';
import pool from '../db/index.js';

const router = Router();

router.get('/clusters', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      'SELECT c.*, COUNT(n.id)::int AS node_count, COUNT(n.id) FILTER (WHERE n.status = \'online\')::int AS healthy_nodes FROM clusters c LEFT JOIN nodes n ON n.cluster_id = c.id GROUP BY c.id ORDER BY c.created_at DESC'
    );
    res.json({ data: rows.map(mapClusterList), pagination: { page: 1, limit: 20, total: rows.length } });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

router.get('/clusters/:id', async (req: Request, res: Response) => {
  try {
    const { rows: [cluster] } = await pool.query('SELECT * FROM clusters WHERE id = $1', [req.params.id]);
    if (!cluster) return res.status(404).json({ error: { code: 'not_found', message: 'Cluster not found' } });

    const { rows: nodes } = await pool.query('SELECT * FROM nodes WHERE cluster_id = $1 ORDER BY hostname', [req.params.id]);
    const allGpuCards = [];
    for (const node of nodes) {
      const { rows: cards } = await pool.query('SELECT * FROM gpu_cards WHERE node_id = $1 ORDER BY card_index', [node.id]);
      allGpuCards.push(...cards);
    }
    const totalGpu = nodes.reduce((s: number, n: any) => s + n.gpu_count, 0);
    const avgUtil = 0; // real-time utilization from ClickHouse, placeholder

    res.json({ data: { ...cluster, nodes, total_gpu: totalGpu, avg_gpu_util: avgUtil } });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

function mapClusterList(r: any) {
  return {
    id: r.id,
    name: r.name,
    region: r.region,
    gpu_type: r.gpu_type,
    node_count: r.node_count,
    healthy_nodes: r.healthy_nodes,
    status: r.healthy_nodes === r.node_count ? 'healthy' : r.healthy_nodes === 0 ? 'offline' : 'degraded',
    avg_gpu_util: 0,
    created_at: r.created_at,
  };
}

export default router;
