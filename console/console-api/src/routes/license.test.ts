import { describe, it, expect } from 'vitest';

async function setup() {
  const express = (await import('express')).default;
  const { default: licenseRoutes } = await import('./license.js');
  const supertest = (await import('supertest')).default;
  const app = express();
  app.use('/v1/admin', licenseRoutes);
  return supertest(app);
}

describe('GET /v1/admin/license', () => {
  it('returns license info', async () => {
    const request = await setup();
    const res = await request.get('/v1/admin/license');
    expect(res.status).toBe(200);
    expect(res.body.data.key).toBe('ULTR-XXXX-XXXX-XXXX-XXXX');
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.plan).toBe('Enterprise');
  });

  it('has correct structure', async () => {
    const request = await setup();
    const res = await request.get('/v1/admin/license');
    expect(res.body.data.max_gpus).toBe(64);
    expect(res.body.data.max_users).toBe(50);
    expect(res.body.data.support_level).toBe('premium');
  });
});
