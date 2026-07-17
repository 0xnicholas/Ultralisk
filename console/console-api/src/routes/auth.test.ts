import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock authService BEFORE importing the route.
vi.mock('../services/authService', () => ({
  pingAuthService: vi.fn(),
  login: vi.fn(),
}));

// Mock db pool so devLogin() doesn't try to upsert users.
vi.mock('../db', () => ({
  default: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));

// Need to control NODE_ENV per test.
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
function setNodeEnv(v: string | undefined) {
  if (v === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = v;
}

beforeEach(() => {
  vi.resetModules();
  setNodeEnv(undefined);
  delete process.env.ALLOW_DEV_LOGIN;
});

afterEach(() => {
  setNodeEnv(ORIGINAL_NODE_ENV);
});

async function postLogin(email: string) {
  const { default: authRoutes } = await import('./auth.js');
  const express = (await import('express')).default;
  const app = express();
  app.use(express.json());
  app.use('/v1/admin', authRoutes);
  const supertest = (await import('supertest')).default;
  return supertest(app).post('/v1/admin/auth/login').send({ email, password: 'x' });
}

describe('POST /auth/login - production safety', () => {
  it('in dev mode, accepts dev@ultralisk.com without auth-service', async () => {
    const { pingAuthService } = await import('../services/authService');
    (pingAuthService as any).mockResolvedValue(false);
    const r = await postLogin('dev@ultralisk.com');
    expect(r.status).toBe(200);
    expect(r.body.data.jwt).toBeTruthy();
  });

  it('in production, rejects dev credentials (returns 503 when auth-service is down)', async () => {
    setNodeEnv('production');
    const { pingAuthService } = await import('../services/authService');
    (pingAuthService as any).mockResolvedValue(false);
    const r = await postLogin('dev@ultralisk.com');
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('auth_service_unavailable');
  });

  it('in production, real credentials also get a 503 when auth-service is down', async () => {
    setNodeEnv('production');
    const { pingAuthService } = await import('../services/authService');
    (pingAuthService as any).mockResolvedValue(false);
    const r = await postLogin('real@example.com');
    expect(r.status).toBe(503);
  });

  it('ALLOW_DEV_LOGIN=false in dev mode disables the dev login path', async () => {
    process.env.ALLOW_DEV_LOGIN = 'false';
    const { pingAuthService } = await import('../services/authService');
    (pingAuthService as any).mockResolvedValue(false);
    const r = await postLogin('dev@ultralisk.com');
    expect(r.status).toBe(503);
  });

  it('when auth-service is reachable, real credentials go through it', async () => {
    const { pingAuthService, login } = await import('../services/authService');
    (pingAuthService as any).mockResolvedValue(true);
    (login as any).mockResolvedValue({
      access_token: 'real-jwt',
      refresh_token: '',
      expires_in: 3600,
      totp_required: false,
      session_token: null,
      user: { id: 'u1', email: 'real@example.com', display_name: 'Real', role: 'admin', org: { id: 'o1', name: 'O' } },
    });
    const r = await postLogin('real@example.com');
    expect(r.status).toBe(200);
    expect(r.body.data.jwt).toBe('real-jwt');
    expect(login).toHaveBeenCalled();
  });
});