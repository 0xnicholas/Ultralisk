/**
 * RBAC middleware for route-level authorization.
 *
 * Usage: mount once after authMiddleware in index.ts:
 *   app.use('/v1/admin', rbacMiddleware);
 *   app.use('/v1', rbacMiddleware);
 *
 * The middleware matches the request path & method against a permission
 * map and rejects requests whose role level is below the minimum required.
 */

import { Request, Response, NextFunction } from 'express';

export type Role = 'owner' | 'admin' | 'developer' | 'billing' | 'readonly';

/** Numeric level for each role (higher = more privileged). */
const ROLE_LEVEL: Record<Role, number> = {
  readonly: 0,
  billing: 20,
  developer: 40,
  admin: 80,
  owner: 100,
};

interface PermissionRule {
  /** Path prefix to match (longest wins). */
  path: string;
  /** HTTP methods this rule governs. Empty = all methods. */
  methods?: string[];
  /** Minimum role required. */
  role: Role;
}

const ALL_METHODS: string[] = [];

/**
 * Permission rules ordered from most specific path to least specific.
 * Rules are evaluated by longest-path-first match, so broader fallback
 * rules come last.
 */
const PERMISSIONS: PermissionRule[] = [
  // ── Owner / Admin only ────────────────────────────────────────
  { path: '/v1/admin/audit-logs', role: 'admin' },
  { path: '/v1/admin/settings/sso', role: 'admin' },
  { path: '/v1/admin/license', role: 'admin' },
  { path: '/v1/admin/organization', methods: ['PUT', 'PATCH', 'DELETE'], role: 'admin' },

  // ── Billing (or higher) ──────────────────────────────────────
  { path: '/v1/admin/billing', role: 'billing' },
  { path: '/v1/admin/cost-analytics', role: 'billing' },

  // ── Developer+ on write operations ────────────────────────────
  { path: '/v1/admin/endpoints', methods: ['POST', 'PATCH', 'DELETE'], role: 'developer' },
  { path: '/v1/admin/batch-jobs', methods: ['POST', 'DELETE'], role: 'developer' },
  { path: '/v1/admin/deployments', methods: ['POST'], role: 'developer' },
  { path: '/v1/admin/models/registry', methods: ['POST', 'DELETE'], role: 'developer' },
  { path: '/v1/admin/api-keys', methods: ['POST', 'DELETE'], role: 'developer' },
  { path: '/v1/admin/incidents', methods: ['PATCH', 'POST'], role: 'developer' },
  { path: '/v1/admin/settings', methods: ['PATCH', 'POST'], role: 'developer' },
  { path: '/v1/admin/sessions', methods: ['POST', 'PATCH', 'DELETE'], role: 'developer' },
  { path: '/v1/chat/completions', methods: ['POST'], role: 'developer' },
  { path: '/v1/playground', methods: ['POST'], role: 'developer' },

  // ── Readonly on GET (any role can read these) ────────────────
  { path: '/v1/admin/models', methods: ['GET'], role: 'readonly' },
  { path: '/v1/admin/usage', methods: ['GET'], role: 'readonly' },
  { path: '/v1/admin/gpu-utilization', methods: ['GET'], role: 'readonly' },
  { path: '/v1/admin/clusters', methods: ['GET'], role: 'readonly' },
  { path: '/v1/admin/nodes', methods: ['GET'], role: 'readonly' },
  { path: '/v1/admin/endpoints', methods: ['GET'], role: 'readonly' },
  { path: '/v1/admin/batch-jobs', methods: ['GET'], role: 'readonly' },
  { path: '/v1/admin/deployments', methods: ['GET'], role: 'readonly' },
  { path: '/v1/admin/incidents', methods: ['GET'], role: 'readonly' },
  { path: '/v1/admin/alerts', methods: ['GET'], role: 'readonly' },
  { path: '/v1/admin/sessions', methods: ['GET'], role: 'readonly' },
  { path: '/v1/admin/settings', methods: ['GET'], role: 'readonly' },
  { path: '/v1/admin/compliance', methods: ['GET'], role: 'readonly' },
  { path: '/v1/admin/api-keys', methods: ['GET'], role: 'readonly' },
  { path: '/v1/admin/organization', methods: ['GET'], role: 'readonly' },
];

function getRoleLevel(role: string): number {
  return ROLE_LEVEL[role as Role] ?? -1;
}

/**
 * Find the matching permission rule for the given method + path.
 * Prefers the longest matching path prefix.
 */
function matchRule(method: string, path: string): PermissionRule | null {
  let best: PermissionRule | null = null;
  let bestLen = 0;

  for (const rule of PERMISSIONS) {
    // Check path prefix
    if (!path.startsWith(rule.path)) continue;
    // Prefer longer (more specific) match
    if (rule.path.length < bestLen) continue;

    // Check method filter
    const methods = rule.methods ?? ALL_METHODS;
    if (methods.length > 0 && !methods.includes(method)) continue;

    // Better match found
    if (rule.path.length > bestLen) {
      best = rule;
      bestLen = rule.path.length;
    }
  }

  return best;
}

/**
 * Express middleware that enforces RBAC based on x-user-role header
 * (set by authMiddleware). Returns 403 when the user's role is
 * insufficient for the requested path + method.
 *
 * Routes not covered by any permission rule default to requiring
 * the 'developer' role.
 */
export function rbacMiddleware(req: Request, res: Response, next: NextFunction): void {
  const userRole = (req.headers['x-user-role'] as string) || 'readonly';
  const userLevel = getRoleLevel(userRole);

  const rule = matchRule(req.method, req.path);

  const requiredRole = rule?.role ?? 'developer';
  const requiredLevel = getRoleLevel(requiredRole);

  if (userLevel < requiredLevel) {
    res.status(403).json({
      error: {
        code: 'forbidden',
        message: `Insufficient permissions. Requires role "${requiredRole}" or higher, but current role is "${userRole}".`,
      },
    });
    return;
  }

  next();
}

// -- Exported for testing ---------------------------------------------------

export function resetPermissions(rules?: PermissionRule[]): void {
  if (rules) {
    PERMISSIONS.length = 0;
    PERMISSIONS.push(...rules);
  }
}
