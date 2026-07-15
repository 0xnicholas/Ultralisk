import { Router, Request, Response } from 'express';
import pool from '../db/index.js';

const router = Router();

router.get('/incidents', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM incidents ORDER BY triggered_at DESC NULLS LAST');
    res.json({ data: rows, pagination: { page: 1, limit: 20, total: rows.length } });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

router.get('/incidents/:id', async (req: Request, res: Response) => {
  try {
    const { rows: [inc] } = await pool.query('SELECT * FROM incidents WHERE id = $1', [req.params.id]);
    if (!inc) return res.status(404).json({ error: { code: 'not_found', message: 'Incident not found' } });
    res.json({ data: inc });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

router.patch('/incidents/:id', async (req: Request, res: Response) => {
  try {
    const { status, mitigated_at, resolved_at } = req.body ?? {};

    const { rows: [existing] } = await pool.query('SELECT * FROM incidents WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'Incident not found' } });

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (status !== undefined) { updates.push(`status = $${idx++}`); values.push(status); }
    if (mitigated_at !== undefined) { updates.push(`mitigated_at = $${idx++}`); values.push(mitigated_at); }
    if (resolved_at !== undefined) { updates.push(`resolved_at = $${idx++}`); values.push(resolved_at); }

    if (updates.length === 0) return res.json({ data: existing });

    values.push(req.params.id);
    const { rows: [inc] } = await pool.query(
      `UPDATE incidents SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, values
    );

    res.json({ data: inc });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

router.post('/incidents/:id/actions', async (req: Request, res: Response) => {
  try {
    const { rows: [existing] } = await pool.query('SELECT * FROM incidents WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'Incident not found' } });

    const action = {
      timestamp: new Date().toISOString(),
      user_id: req.body?.user_id ?? 'system',
      action: req.body?.action ?? '',
      result: req.body?.result ?? '',
    };

    const actionLog = existing.action_log || [];
    actionLog.push(action);

    await pool.query('UPDATE incidents SET action_log = $2 WHERE id = $1', [req.params.id, JSON.stringify(actionLog)]);

    res.status(201).json({ data: action });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

export default router;
