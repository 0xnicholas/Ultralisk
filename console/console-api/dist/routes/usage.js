import { Router } from 'express';
import pool from '../db';
const router = Router();
router.get('/usage', async (req, res) => {
    try {
        const orgId = req.headers['x-org-id'];
        if (!orgId)
            return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });
        const days = parseInt(req.query.days) || 7;
        const since = new Date(Date.now() - days * 86400000).toISOString();
        const { rows } = await pool.query(`SELECT model_id, COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
              COALESCE(SUM(completion_tokens), 0) as completion_tokens,
              date_trunc('hour', started_at) as hour
       FROM raw_usage_events
       WHERE org_id = $1 AND started_at >= $2
       GROUP BY model_id, date_trunc('hour', started_at)
       ORDER BY hour DESC`, [orgId, since]);
        res.json({ data: rows });
    }
    catch (err) {
        res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
    }
});
export default router;
