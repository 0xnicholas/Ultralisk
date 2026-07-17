import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function setup() {
  const express = (await import('express')).default;
  const { default: playgroundRoutes } = await import('./playground.js');
  const supertest = (await import('supertest')).default;
  const app = express();
  app.use(express.json());
  app.use('/v1', playgroundRoutes);
  return supertest(app);
}

// Mock fetch globally
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('POST /v1/chat/completions (non-streaming)', () => {
  it('forwards request to gateway and returns response', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: async () => ({ id: 'chat_1', choices: [{ message: { content: 'Hello!' } }] }),
      body: null,
      headers: new Headers(),
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const request = await setup();
    const res = await request.post('/v1/chat/completions')
      .set('authorization', 'Bearer ultr_test')
      .send({ model: 'llama-3.1-8b', messages: [{ role: 'user', content: 'Hi' }] });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('chat_1');
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it('returns 502 when gateway is unreachable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const request = await setup();
    const res = await request.post('/v1/chat/completions')
      .set('authorization', 'Bearer ultr_test')
      .send({ model: 'llama-3.1-8b', messages: [] });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('upstream_error');
  });
});

describe('POST /v1/chat/completions (streaming)', () => {
  it('streams SSE response from gateway', async () => {
    // Create a ReadableStream that yields SSE chunks
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    const mockResponse = {
      ok: true,
      status: 200,
      body: stream,
      headers: new Headers(),
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const request = await setup();
    const res = await request.post('/v1/chat/completions')
      .set('authorization', 'Bearer ultr_test')
      .send({ model: 'llama-3.1-8b', messages: [{ role: 'user', content: 'Hi' }], stream: true });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Hello');
    expect(res.text).toContain('[DONE]');
  });

  it('handles gateway stream failure gracefully', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('stream error'));
    const request = await setup();
    const res = await request.post('/v1/chat/completions')
      .set('authorization', 'Bearer ultr_test')
      .send({ model: 'llama-3.1-8b', messages: [], stream: true });
    expect(res.status).toBe(502);
  });
});
