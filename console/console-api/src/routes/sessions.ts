import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });
    const { rows } = await pool.query(
      'SELECT id, name, model_id, messages, created_at, updated_at FROM chat_sessions WHERE user_id = $1 ORDER BY updated_at DESC', [userId]
    );
    res.json({ data: rows.map(mapSession), pagination: { page: 1, limit: 20, total: rows.length } });
  } catch (err) { res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } }); }
});

router.post('/sessions', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const orgId = req.headers['x-org-id'] as string;
    if (!userId || !orgId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });
    const { name, model_id, messages } = req.body;
    const { rows: [session] } = await pool.query(
      `INSERT INTO chat_sessions (user_id, org_id, name, model_id, messages)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, model_id, messages, created_at, updated_at`,
      [userId, orgId, name ?? 'New Chat', model_id ?? 'llama-3.1-8b-instruct', JSON.stringify(messages ?? [])]
    );
    res.status(201).json({ data: mapSession(session) });
  } catch (err) { res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } }); }
});

router.patch('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });
    const { name, messages } = req.body;
    const { rows: [session] } = await pool.query(
      `UPDATE chat_sessions SET name = COALESCE($3, name), messages = COALESCE($4::jsonb, messages), updated_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING id, name, model_id, messages, created_at, updated_at`,
      [req.params.id, userId, name ?? null, messages ? JSON.stringify(messages) : null]
    );
    if (!session) return res.status(404).json({ error: { code: 'not_found', message: 'Session not found' } });
    res.json({ data: mapSession(session) });
  } catch (err) { res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } }); }
});

router.delete('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });
    const result = await pool.query('DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
    if (result.rowCount === 0) return res.status(404).send();
    res.status(204).send();
  } catch (err) { res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } }); }
});

function mapSession(r: any) {
  return {
    id: r.id, name: r.name, model_id: r.model_id,
    messages: typeof r.messages === 'string' ? JSON.parse(r.messages) : r.messages,
    created_at: r.created_at, updated_at: r.updated_at,
  };
}

export default router;
