import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db/index.js';
const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

const USER_ID = 'usr_123';
const ORG_ID = 'org_001';

async function setup() {
  const express = (await import('express')).default;
  const { default: batchJobsRoutes } = await import('./batchJobs.js');
  const supertest = (await import('supertest')).default;
  const app = express();
  app.use(express.json());
  app.use('/v1/admin', batchJobsRoutes);
  return supertest(app);
}

beforeEach(() => {
  mockQuery.mockReset();
});

const sampleJob = {
  id: 'bj_1', name: 'summarize-q1', model_id: 'llama-3.1-8b',
  status: 'completed', input_file: 's3://input/summaries.jsonl',
  output_file: 's3://output/summaries.jsonl', callback_url: null,
  token_count: 150000, cost: 0.45,
  created_at: '2026-01-01T00:00:00Z', completed_at: '2026-01-01T01:00:00Z',
  error_log: null,
};

describe('GET /v1/admin/batch-jobs', () => {
  it('returns batch jobs for authenticated user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleJob] });
    const request = await setup();
    const res = await request.get('/v1/admin/batch-jobs')
      .set('x-user-id', USER_ID);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('summarize-q1');
  });

  it('returns 401 without x-user-id', async () => {
    const request = await setup();
    const res = await request.get('/v1/admin/batch-jobs');
    expect(res.status).toBe(401);
  });

  it('returns empty list', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.get('/v1/admin/batch-jobs')
      .set('x-user-id', USER_ID);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('GET /v1/admin/batch-jobs/:id', () => {
  it('returns batch job detail', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleJob] });
    const request = await setup();
    const res = await request.get('/v1/admin/batch-jobs/bj_1')
      .set('x-user-id', USER_ID);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('bj_1');
    expect(res.body.data.token_count).toBe(150000);
  });

  it('returns 404 for unknown job', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.get('/v1/admin/batch-jobs/nonexistent')
      .set('x-user-id', USER_ID);
    expect(res.status).toBe(404);
  });
});

describe('POST /v1/admin/batch-jobs', () => {
  it('creates a batch job', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleJob, id: 'bj_new', status: 'pending' }] });
    const request = await setup();
    const res = await request.post('/v1/admin/batch-jobs')
      .set('x-user-id', USER_ID)
      .set('x-org-id', ORG_ID)
      .send({ name: 'new-job', model_id: 'llama-3.1-8b', input_file: 's3://input/data.jsonl' });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('bj_new');
  });

  it('returns 401 without auth headers', async () => {
    const request = await setup();
    const res = await request.post('/v1/admin/batch-jobs')
      .send({ name: 'new-job', model_id: 'm1', input_file: 's3://input/x.jsonl' });
    expect(res.status).toBe(401);
  });
});

describe('DELETE /v1/admin/batch-jobs/:id', () => {
  it('deletes a batch job', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    const request = await setup();
    const res = await request.delete('/v1/admin/batch-jobs/bj_1')
      .set('x-user-id', USER_ID);
    expect(res.status).toBe(204);
  });

  it('returns 404 for unknown job', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });
    const request = await setup();
    const res = await request.delete('/v1/admin/batch-jobs/nonexistent')
      .set('x-user-id', USER_ID);
    expect(res.status).toBe(404);
  });
});
