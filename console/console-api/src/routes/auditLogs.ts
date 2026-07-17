import { Router, Request, Response } from 'express';
import pool from '../db/index.js';

const router = Router();

function getOrgId(req: Request): string {
  return (req.headers['x-org-id'] as string) || '00000000-0000-0000-0000-000000000001';
}

router.get('/audit-logs', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;

    const conditions: string[] = ['al.org_id = $1'];
    const params: any[] = [orgId];
    let paramIdx = 2;

    if (req.query.action) {
      conditions.push(`al.action = $${paramIdx++}`);
      params.push(req.query.action as string);
    }
    if (req.query.resource_type) {
      conditions.push(`al.resource_type = $${paramIdx++}`);
      params.push(req.query.resource_type as string);
    }
    if (req.query.from) {
      conditions.push(`al.created_at >= $${paramIdx++}`);
      params.push(req.query.from as string);
    }
    if (req.query.to) {
      conditions.push(`al.created_at <= $${paramIdx++}`);
      params.push(req.query.to as string);
    }
    if (req.query.q) {
      conditions.push(`(al.user_email ILIKE $${paramIdx} OR al.action ILIKE $${paramIdx} OR al.resource_type ILIKE $${paramIdx} OR al.resource_id ILIKE $${paramIdx})`);
      params.push(`%${req.query.q}%`);
      paramIdx++;
    }

    const where = conditions.join(' AND ');

    const { rows: countResult } = await pool.query(
      `SELECT COUNT(*) FROM audit_logs al WHERE ${where}`, params
    );
    const total = parseInt(countResult[0].count);

    const { rows } = await pool.query(
      `SELECT al.* FROM audit_logs al WHERE ${where} ORDER BY al.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    res.json({
      data: rows,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

router.get('/audit-logs/export', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const conditions: string[] = ['org_id = $1'];
    const params: any[] = [orgId];
    let paramIdx = 2;

    if (req.query.from) {
      conditions.push(`created_at >= $${paramIdx++}`);
      params.push(req.query.from as string);
    }
    if (req.query.to) {
      conditions.push(`created_at <= $${paramIdx++}`);
      params.push(req.query.to as string);
    }

    const { rows } = await pool.query(
      `SELECT created_at, user_email, action, resource_type, resource_id, details, ip_address
       FROM audit_logs WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC`,
      params
    );

    const header = 'Timestamp,User,Action,Resource Type,Resource ID,Details,IP Address\n';
    const csv = header + rows.map((r: any) =>
      [
        r.created_at?.toISOString?.() || r.created_at,
        r.user_email || '',
        r.action,
        r.resource_type,
        r.resource_id || '',
        typeof r.details === 'object' ? JSON.stringify(r.details).replace(/"/g, '""') : '',
        r.ip_address || '',
      ].map((v) => `"${v}"`).join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

export default router;
