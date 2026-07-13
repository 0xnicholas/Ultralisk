import { Router } from 'express';
import pool from '../db';
const router = Router();
router.get('/billing', async (req, res) => {
    try {
        const orgId = req.headers['x-org-id'];
        if (!orgId)
            return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });
        const yearMonth = new Date().toISOString().substring(0, 7);
        const { rows: [summary] } = await pool.query('SELECT * FROM billing_summary WHERE org_id = $1 AND year_month = $2', [orgId, yearMonth]);
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const { rows: [usage] } = await pool.query(`SELECT COALESCE(SUM(prompt_tokens), 0) as total_prompt,
              COALESCE(SUM(completion_tokens), 0) as total_completion
       FROM raw_usage_events
       WHERE org_id = $1 AND started_at >= $2`, [orgId, monthStart]);
        res.json({ data: {
                currentMonth: summary || { total_tokens: 0, total_cost: '0' },
                realtime: {
                    promptTokens: parseInt(usage?.total_prompt || '0'),
                    completionTokens: parseInt(usage?.total_completion || '0'),
                    totalTokens: parseInt(usage?.total_prompt || '0') + parseInt(usage?.total_completion || '0'),
                },
            } });
    }
    catch (err) {
        res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
    }
});
export default router;
