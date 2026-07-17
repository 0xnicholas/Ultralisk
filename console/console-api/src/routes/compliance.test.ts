import { describe, it, expect } from 'vitest';

async function setup() {
  const express = (await import('express')).default;
  const { default: complianceRoutes } = await import('./compliance.js');
  const supertest = (await import('supertest')).default;
  const app = express();
  app.use('/v1/admin', complianceRoutes);
  return supertest(app);
}

describe('GET /v1/admin/compliance', () => {
  it('returns compliance status', async () => {
    const request = await setup();
    const res = await request.get('/v1/admin/compliance');
    expect(res.status).toBe(200);
    expect(res.body.data.soc2.status).toBe('compliant');
    expect(res.body.data.iso27001.status).toBe('in_progress');
    expect(res.body.data.encryption.at_rest).toBe(true);
    expect(res.body.data.encryption.in_transit).toBe(true);
  });

  it('has expected structure', async () => {
    const request = await setup();
    const res = await request.get('/v1/admin/compliance');
    expect(res.body.data).toHaveProperty('soc2');
    expect(res.body.data).toHaveProperty('iso27001');
    expect(res.body.data).toHaveProperty('encryption');
    expect(res.body.data).toHaveProperty('data_retention');
    expect(res.body.data.data_retention.retention_days).toBe(90);
  });
});
