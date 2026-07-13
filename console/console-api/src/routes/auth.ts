import { Router, Request, Response } from 'express';
import pool from '../db';
import { login } from '../services/authService';

const router = Router();

router.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const result = await login(email, password);
    res.cookie('jwt', result.access_token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict', maxAge: 3600 * 1000,
    });
    res.json({ data: result });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/auth/logout', (_req: Request, res: Response) => {
  res.clearCookie('jwt');
  res.json({ data: { ok: true } });
});

router.get('/auth/me', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const { rows: [user] } = await pool.query('SELECT id, org_id, email, display_name, role FROM users WHERE id = $1', [userId]);
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    const { rows: [org] } = await pool.query('SELECT id, name FROM orgs WHERE id = $1', [user.org_id]);
    const { rows: keys } = await pool.query(
      'SELECT id, key_prefix, name, status, last_used_at, created_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC', [userId]
    );

    res.json({ data: {
      id: user.id, email: user.email, displayName: user.display_name, role: user.role,
      org: org ? { id: org.id, name: org.name } : null,
      apiKeys: keys.map((k: any) => ({
        id: k.id, keyPrefix: k.key_prefix, name: k.name, status: k.status,
        lastUsedAt: k.last_used_at, createdAt: k.created_at,
      })),
    }});
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
