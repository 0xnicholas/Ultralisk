import { describe, it, expect, beforeEach } from 'vitest';

// ssoConfig doesn't use the database — it's in-memory mock data.
// We must reset the module to clear state between tests.
async function setup() {
  const express = (await import('express')).default;
  const { default: ssoRoutes } = await import('./ssoConfig.js');
  const supertest = (await import('supertest')).default;
  const app = express();
  app.use(express.json());
  app.use('/v1/admin', ssoRoutes);
  return supertest(app);
}

describe('GET /v1/admin/settings/sso', () => {
  it('returns the SSO config', async () => {
    const request = await setup();
    const res = await request.get('/v1/admin/settings/sso');
    expect(res.status).toBe(200);
    expect(res.body.data.provider).toBe('saml');
    expect(res.body.data.enabled).toBe(false);
    expect(res.body.data.jit_provisioning).toBe(true);
  });

  it('has expected default structure', async () => {
    const request = await setup();
    const res = await request.get('/v1/admin/settings/sso');
    expect(res.body.data).toHaveProperty('entity_id');
    expect(res.body.data).toHaveProperty('acs_url');
    expect(res.body.data).toHaveProperty('idp_sso_url');
    expect(res.body.data).toHaveProperty('idp_entity_id');
    expect(res.body.data).toHaveProperty('default_role');
  });
});

describe('PUT /v1/admin/settings/sso', () => {
  it('updates SSO config', async () => {
    const request = await setup();
    const res = await request.put('/v1/admin/settings/sso')
      .send({ enabled: true, idp_sso_url: 'https://idp.example.com/saml' });
    expect(res.status).toBe(200);
    expect(res.body.data.enabled).toBe(true);
    expect(res.body.data.idp_sso_url).toBe('https://idp.example.com/saml');
  });

  it('merges partial updates', async () => {
    const request = await setup();
    await request.put('/v1/admin/settings/sso')
      .send({ provider: 'oidc' });
    const res = await request.get('/v1/admin/settings/sso');
    expect(res.body.data.provider).toBe('oidc');
    // Other fields should retain defaults
    expect(res.body.data.jit_provisioning).toBe(true);
  });
});

describe('POST /v1/admin/settings/sso/test', () => {
  it('returns test success', async () => {
    const request = await setup();
    const res = await request.post('/v1/admin/settings/sso/test');
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
  });
});
