import pool from '../db/index.js';
import { logger } from '../logger.js';

export interface AuditLogEntry {
  org_id: string;
  user_id?: string | null;
  user_email?: string | null;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  details?: Record<string, unknown>;
  ip_address?: string | null;
  user_agent?: string | null;
}

export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_logs (org_id, user_id, user_email, action, resource_type, resource_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        entry.org_id,
        entry.user_id || null,
        entry.user_email || null,
        entry.action,
        entry.resource_type,
        entry.resource_id || null,
        entry.details ? JSON.stringify(entry.details) : '{}',
        entry.ip_address || null,
        entry.user_agent || null,
      ]
    );
  } catch (err) {
    logger.error({ err }, 'audit log write failed');
  }
}

export function auditMiddleware(req: any, res: any, next: any) {
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    const method = req.method;
    const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    if (isMutating && res.statusCode < 500) {
      const pathParts = req.path.split('/').filter(Boolean);
      const resourceType = pathParts[pathParts.length - 1] || 'unknown';
      writeAuditLog({
        org_id: req.headers['x-org-id'] as string || '00000000-0000-0000-0000-000000000001',
        user_id: req.headers['x-user-id'] as string || null,
        user_email: null,
        action: `${method.toLowerCase()}.${resourceType}`,
        resource_type: resourceType,
        resource_id: req.params?.id || req.body?.id || null,
        details: { path: req.path, status: res.statusCode },
        ip_address: req.ip,
        user_agent: req.headers['user-agent'] as string || null,
      });
    }
    return originalJson(body);
  };
  next();
}
