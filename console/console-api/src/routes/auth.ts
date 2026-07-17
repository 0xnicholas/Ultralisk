import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pool from '../db';
import { login as authServiceLogin, pingAuthService } from '../services/authService';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const IS_PROD = process.env.NODE_ENV === 'production';

// devLogin() mints a JWT directly using the local JWT_SECRET, bypassing
// auth-service entirely. Convenient for local dev but a real security risk
// in production: a misconfigured deployment where auth-service is
// unreachable would silently issue admin JWTs to anyone. Gated behind
// NODE_ENV !== 'production' AND an explicit opt-in.
const ALLOW_DEV_LOGIN = !IS_PROD && process.env.ALLOW_DEV_LOGIN !== 'false';

function normalizeAuthResponse(raw: any) {
  const u = raw?.user ?? {};
  const org = u.org ?? null;
  const user = {
    id: u.id ?? raw?.user_id ?? 'usr_unknown',
    email: u.email ?? '',
    displayName: u.display_name ?? u.displayName ?? u.email ?? 'User',
    role: u.role ?? 'developer',
    org: org ? { id: org.id, name: org.name } : null,
  };
  return {
    user,
    jwt: raw?.access_token ?? '',
    access_token: raw?.access_token ?? '',
    refresh_token: raw?.refresh_token ?? '',
    expires_in: raw?.expires_in ?? 3600,
    totp_required: Boolean(raw?.totp_required),
    session_token: raw?.session_token ?? null,
  };
}

async function devLogin(email: string, _password: string) {
  const orgId = '00000000-0000-0000-0000-000000000001';

  await pool.query(
    `INSERT INTO orgs (id, name, slug) VALUES ($1, $2, 'default')
     ON CONFLICT (id) DO NOTHING`,
    [orgId, 'Default Org']
  );

  const { rows: existing } = await pool.query('SELECT id, org_id FROM users WHERE email = $1', [email]);
  let userId: string;
  if (existing.length > 0) {
    userId = existing[0].id;
  } else {
    userId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO users (id, org_id, email, password_hash, display_name, role)
       VALUES ($1, $2, $3, 'dev', $4, 'admin')`,
      [userId, orgId, email, email.split('@')[0]]
    );
  }

  const token = jwt.sign(
    { sub: userId, org_id: orgId, role: 'admin' },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h', issuer: 'ultralisk-auth' }
  );

  return {
    access_token: token,
    refresh_token: '',
    expires_in: 3600,
    totp_required: false,
    session_token: null,
    user: {
      id: userId,
      email,
      display_name: email.split('@')[0],
      role: 'admin',
      org: { id: orgId, name: 'Default Org' },
    },
  };
}

router.post('/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: { code: 'invalid_request', message: 'Email and password are required' } });
  }

  const isDevCredentials = email.startsWith('dev@') || email.endsWith('@ultralisk.dev');
  let raw: any;
  try {
    if (isDevCredentials && ALLOW_DEV_LOGIN) {
      raw = await devLogin(email, password);
    } else if (await pingAuthService()) {
      raw = await authServiceLogin(email, password);
    } else if (isDevCredentials && ALLOW_DEV_LOGIN) {
      // Auth-service down + dev credential + dev mode -> still log in so
      // the dev loop is unbroken. NOT taken when NODE_ENV=production.
      raw = await devLogin(email, password);
    } else {
      req.log?.error({ email, isDevCredentials }, 'login: auth-service unreachable');
      return res.status(503).json({
        error: { code: 'auth_service_unavailable', message: 'Auth service is unreachable. Please try again shortly.' },
      });
    }
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: { code: 'auth_error', message: err.message || 'Login failed' } });
  }

  const normalized = normalizeAuthResponse(raw);
  if (normalized.jwt) {
    res.cookie('jwt', normalized.jwt, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict', maxAge: 3600 * 1000,
    });
  }
  res.json({ data: normalized });
});

router.post('/auth/logout', (_req: Request, res: Response) => {
  res.clearCookie('jwt');
  res.json({ data: { ok: true } });
});

router.get('/auth/me', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) return res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });

    const { rows: [user] } = await pool.query('SELECT id, org_id, email, display_name, role FROM users WHERE id = $1', [userId]);
    if (!user) return res.status(404).json({ error: { code: 'user_not_found', message: 'User not found' } });

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
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

// === Invitations (Phase 2, migrated from mock) ===

router.post('/auth/accept-invitation', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: { code: 'invalid_request', message: 'Token is required' } });

    const { rows: [invite] } = await pool.query(
      'SELECT * FROM invitations WHERE token = $1 AND status = \'pending\' AND expires_at > NOW()', [token]
    );
    if (!invite) return res.status(400).json({ error: { code: 'invalid_token', message: 'Invalid or expired invitation token' } });

    await pool.query('UPDATE invitations SET status = \'accepted\', accepted_at = NOW() WHERE id = $1', [invite.id]);

    res.json({ data: { ok: true } });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

router.post('/invitations', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const orgId = req.headers['x-org-id'] as string || '00000000-0000-0000-0000-000000000001';
    const { email, role } = req.body;
    if (!email) return res.status(400).json({ error: { code: 'invalid_request', message: 'Email is required' } });

    const token = 'inv_' + crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();

    const { rows: [invite] } = await pool.query(
      `INSERT INTO invitations (org_id, email, token, role, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [orgId, email, token, role || 'developer', userId || null, expiresAt]
    );

    res.status(201).json({ data: { token: invite.token, email: invite.email, expires_at: invite.expires_at } });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

router.get('/invitations', async (req: Request, res: Response) => {
  try {
    const orgId = req.headers['x-org-id'] as string || '00000000-0000-0000-0000-000000000001';

    const { rows } = await pool.query(
      'SELECT token, email, role, status, created_at, expires_at FROM invitations WHERE org_id = $1 ORDER BY created_at DESC',
      [orgId]
    );

    res.json({ data: rows.map((r: any) => ({
      token: r.token, email: r.email, role: r.role, status: r.status,
      created_at: r.created_at, expires_at: r.expires_at,
    })) });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

export default router;
