import { Router } from 'express';
import pool from '../db';
const router = Router();
router.get('/models', async (_req, res) => {
    try {
        const { rows } = await pool.query("SELECT * FROM models WHERE status = 'active'");
        res.json({ data: rows, pagination: { page: 1, limit: 20, total: rows.length } });
    }
    catch (err) {
        res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
    }
});
router.get('/models/:id', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM models WHERE id = $1', [req.params.id]);
        if (!rows[0])
            return res.status(404).json({ error: { code: 'not_found', message: 'Model not found' } });
        res.json({ data: rows[0] });
    }
    catch (err) {
        res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
    }
});
export default router;
