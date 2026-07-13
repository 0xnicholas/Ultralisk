import { Router, Request, Response } from 'express';
import { createHash, randomBytes } from 'crypto';
import pool from '../db';

const router = Router();

function generateKey(): string {
  return `ultr_${randomBytes(24).toString('base64url').substring(0, 32)}`;
}
function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
function keyPrefix(key: string): string {
  return key.substring(0, 9);
}

router.get('/api-keys', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    const { rows } = await pool.query(
      'SELECT id, key_prefix, name, status, quota_limits, last_used_at, created_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC', [userId]
    );
    res.json({ data: rows.map((k: any) => ({
      id: k.id, keyPrefix: k.key_prefix, name: k.name, status: k.status,
      quotaLimits: k.quota_limits, lastUsedAt: k.last_used_at, createdAt: k.created_at,
    }))});
  } catch (err) { res.status(500).json({ error: 'internal_error' }); }
});

router.post('/api-keys', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const orgId = req.headers['x-org-id'] as string;
    if (!userId || !orgId) return res.status(401).json({ error: 'unauthorized' });

    const { name, quotaLimits } = req.body;
    const plaintext = generateKey();
    const { rows: [key] } = await pool.query(
      `INSERT INTO api_keys (user_id, org_id, key_hash, key_prefix, name, quota_limits)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, key_prefix, name, created_at`,
      [userId, orgId, hashKey(plaintext), keyPrefix(plaintext), name, JSON.stringify(quotaLimits || { '*': 50000 })]
    );
    res.status(201).json({ data: { ...key, key: plaintext } });
  } catch (err) { res.status(500).json({ error: 'internal_error' }); }
});

router.delete('/api-keys/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) return res.status(401).json({ error: 'unauthorized' });
    await pool.query("UPDATE api_keys SET status = 'revoked', revoked_at = now() WHERE id = $1 AND user_id = $2", [req.params.id, userId]);
    res.json({ data: { status: 'revoked' } });
  } catch (err) { res.status(500).json({ error: 'internal_error' }); }
});

export default router;
