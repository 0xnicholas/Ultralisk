import { describe, it, expect } from 'vitest';

async function setup() {
  const express = (await import('express')).default;
  const { default: healthRoutes } = await import('./health.js');
  const supertest = (await import('supertest')).default;
  const app = express();
  app.use(healthRoutes);
  return supertest(app);
}

describe('GET /health', () => {
  it('returns ok status', async () => {
    const request = await setup();
    const res = await request.get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('console-api');
  });
});

describe('GET /health/ready', () => {
  it('returns status with db checks', async () => {
    // db pool.query will fail since it's not mocked in this test,
    // but the route should still return a structured response
    const request = await setup();
    const res = await request.get('/health/ready');
    // Either 200 or 503 depending on whether db is available
    expect([200, 503]).toContain(res.status);
    expect(['ready', 'not_ready']).toContain(res.body.status);
    expect(res.body.checks).toHaveProperty('database');
  });
});
