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
  const { default: sessionsRoutes } = await import('./sessions.js');
  const supertest = (await import('supertest')).default;
  const app = express();
  app.use(express.json());
  app.use('/v1/admin', sessionsRoutes);
  return supertest(app);
}

beforeEach(() => {
  mockQuery.mockReset();
});

const sampleSession = {
  id: 'sess_1', name: 'Chat about GPUs', model_id: 'llama-3.1-8b-instruct',
  messages: [{ role: 'user', content: 'How do GPUs work?' }],
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:01:00Z',
};

describe('GET /v1/admin/sessions', () => {
  it('returns sessions for user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [sampleSession] });
    const request = await setup();
    const res = await request.get('/v1/admin/sessions')
      .set('x-user-id', USER_ID);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Chat about GPUs');
  });

  it('returns 401 without x-user-id', async () => {
    const request = await setup();
    const res = await request.get('/v1/admin/sessions');
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/admin/sessions', () => {
  it('creates a new chat session', async () => {
    const newSession = { ...sampleSession, id: 'sess_new', name: 'New Chat' };
    mockQuery.mockResolvedValueOnce({ rows: [newSession] });
    const request = await setup();
    const res = await request.post('/v1/admin/sessions')
      .set('x-user-id', USER_ID)
      .set('x-org-id', ORG_ID)
      .send({ model_id: 'llama-3.1-8b-instruct' });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('sess_new');
  });

  it('returns 401 without auth headers', async () => {
    const request = await setup();
    const res = await request.post('/v1/admin/sessions')
      .send({ model_id: 'llama-3.1-8b-instruct' });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /v1/admin/sessions/:id', () => {
  it('updates session name and messages', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleSession, name: 'Renamed', messages: [{ role: 'user', content: 'Hello' }] }] });
    const request = await setup();
    const res = await request.patch('/v1/admin/sessions/sess_1')
      .set('x-user-id', USER_ID)
      .send({ name: 'Renamed', messages: [{ role: 'user', content: 'Hello' }] });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Renamed');
  });

  it('returns 404 for unknown session', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const request = await setup();
    const res = await request.patch('/v1/admin/sessions/nonexistent')
      .set('x-user-id', USER_ID)
      .send({ name: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /v1/admin/sessions/:id', () => {
  it('deletes a session', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    const request = await setup();
    const res = await request.delete('/v1/admin/sessions/sess_1')
      .set('x-user-id', USER_ID);
    expect(res.status).toBe(204);
  });

  it('returns 404 for unknown session', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });
    const request = await setup();
    const res = await request.delete('/v1/admin/sessions/nonexistent')
      .set('x-user-id', USER_ID);
    expect(res.status).toBe(404);
  });
});
