import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.patch('/organization', async (req: Request, res: Response) => {
  try {
    const orgId = req.headers['x-org-id'] as string;
    if (!orgId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });
    const { name, billing_email } = req.body;
    const updates: string[] = [];
    const values: any[] = [orgId];
    let idx = 2;

    if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
    if (billing_email !== undefined) { updates.push(`billing_email = $${idx++}`); values.push(billing_email); }

    if (updates.length === 0) {
      const { rows: [org] } = await pool.query('SELECT id, name, slug, billing_email, created_at FROM orgs WHERE id = $1', [orgId]);
      if (!org) return res.status(404).json({ error: { code: 'not_found', message: 'Organization not found' } });
      return res.json({ data: mapOrg(org) });
    }

    const { rows: [org] } = await pool.query(
      `UPDATE orgs SET ${updates.join(', ')} WHERE id = $1 RETURNING id, name, slug, billing_email, created_at`, values
    );
    if (!org) return res.status(404).json({ error: { code: 'not_found', message: 'Organization not found' } });
    res.json({ data: mapOrg(org) });
  } catch (err) { res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } }); }
});

function mapOrg(r: any) {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    billing_email: r.billing_email || r.slug,
    plan: 'free',
    created_at: r.created_at,
  };
}

export default router;
