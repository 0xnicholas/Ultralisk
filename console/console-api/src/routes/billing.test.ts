import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db/index.js';
const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

const ORG_ID = 'org_001';

async function setup() {
  const express = (await import('express')).default;
  const { default: billingRoutes } = await import('./billing.js');
  const supertest = (await import('supertest')).default;
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => { req.log = { error: vi.fn() }; next(); });
  app.use('/v1/admin', billingRoutes);
  return supertest(app);
}

beforeEach(() => {
  mockQuery.mockReset();
});

describe('GET /v1/admin/billing', () => {
  it('returns billing info with invoices', async () => {
    // billing summary
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'bs_1', year_month: '2026-06', total_cost: 1234.56 }] });
    // raw usage
    mockQuery.mockResolvedValueOnce({ rows: [{ total_prompt: 500000, total_completion: 300000 }] });
    // models query (for pricing)
    mockQuery.mockResolvedValueOnce({ rows: [
      { pricing_per_1k_input: '0.0005', pricing_per_1k_output: '0.0015' },
    ]});
    // org query
    mockQuery.mockResolvedValueOnce({ rows: [{ id: ORG_ID, name: 'Acme AI' }] });
    // invoice list
    mockQuery.mockResolvedValueOnce({ rows: [
      { id: 'inv_1', year_month: '2026-05', total_cost: 1000.00 },
      { id: 'inv_2', year_month: '2026-04', total_cost: 800.00 },
    ]});

    const request = await setup();
    const res = await request.get('/v1/admin/billing')
      .set('x-org-id', ORG_ID);

    expect(res.status).toBe(200);
    expect(res.body.data.balance_usd).toBe(1000);
    expect(res.body.data.monthly_budget_usd).toBe(5000);
    expect(res.body.data.invoices).toHaveLength(2);
    expect(res.body.data.realtime.promptTokens).toBe(500000);
    expect(res.body.data.realtime.completionTokens).toBe(300000);
  });

  it('returns 401 without x-org-id', async () => {
    const request = await setup();
    const res = await request.get('/v1/admin/billing');
    expect(res.status).toBe(401);
  });

  it('handles empty usage data', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ total_prompt: 0, total_completion: 0 }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const request = await setup();
    const res = await request.get('/v1/admin/billing')
      .set('x-org-id', ORG_ID);

    expect(res.status).toBe(200);
    expect(res.body.data.month_to_date_spend_usd).toBe(0);
  });
});
