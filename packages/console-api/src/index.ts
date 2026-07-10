import express from 'express';
import cors from 'cors';
import {
  MOCK_USER, MOCK_JWT, MOCK_MODELS, MODEL_DETAILS,
  MOCK_USAGE, MOCK_BILLING, MOCK_API_KEYS,
} from './fixtures.js';

const app = express();
app.use(cors());
app.use(express.json());

// === Auth ===
app.post('/v1/admin/auth/login', (_req, res) => {
  res.json({ data: { user: MOCK_USER, jwt: MOCK_JWT } });
});

app.post('/v1/admin/auth/logout', (_req, res) => {
  res.status(200).json({ data: { ok: true } });
});

app.post('/v1/admin/auth/accept-invitation', (_req, res) => {
  res.json({ data: { user: MOCK_USER, jwt: MOCK_JWT } });
});

app.get('/v1/admin/auth/me', (_req, res) => {
  res.json({ data: MOCK_USER });
});

// === Invitations ===
app.post('/v1/admin/invitations', (_req, res) => {
  res.status(201).json({ data: { token: 'mock-invite-token-' + Date.now(), email: (_req as any).body?.email ?? 'dev@example.com', expires_at: new Date(Date.now() + 7 * 86400000).toISOString() } });
});

app.get('/v1/admin/invitations', (_req, res) => {
  res.json({ data: [{ token: 'mock-invite-token-001', email: 'pending@example.com', status: 'pending', created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 86400000).toISOString() }] });
});

// === Models ===
app.get('/v1/admin/models', (_req, res) => {
  res.json({ data: MOCK_MODELS, pagination: { page: 1, limit: 20, total: MOCK_MODELS.length } });
});

app.get('/v1/admin/models/:id', (req, res) => {
  const model = MODEL_DETAILS[req.params.id];
  if (!model) return res.status(404).json({ error: { code: 'not_found', message: 'Model not found' } });
  res.json({ data: model });
});

// === Usage ===
app.get('/v1/admin/usage', (_req, res) => {
  res.json({ data: MOCK_USAGE });
});

// === Billing ===
app.get('/v1/admin/billing', (_req, res) => {
  res.json({ data: MOCK_BILLING });
});

// === API Keys ===
app.get('/v1/admin/api-keys', (_req, res) => {
  res.json({ data: MOCK_API_KEYS, pagination: { page: 1, limit: 20, total: MOCK_API_KEYS.length } });
});

app.post('/v1/admin/api-keys', (req, res) => {
  const body = req.body;
  const newKey = {
    id: `key_${Date.now()}`,
    name: body.name,
    prefix: 'ultr_...xyz',
    role: body.role,
    model_allowlist: body.model_allowlist ?? null,
    monthly_quota_usd: body.monthly_quota_usd ?? null,
    usage_this_month_usd: 0,
    created_by: MOCK_USER.name,
    created_at: new Date().toISOString(),
    last_used_at: null,
    revoked_at: null,
    status: 'active' as const,
    secret: `ultr_mock_${Date.now()}_secret`,
  };
  res.status(201).json({ data: newKey });
});

app.patch('/v1/admin/api-keys/:id', (req, res) => {
  res.json({ data: { ...MOCK_API_KEYS[0], ...req.body, id: req.params.id } });
});

app.delete('/v1/admin/api-keys/:id', (_req, res) => {
  res.status(204).send();
});

// === Chat completions (SSE stub) ===
app.post('/v1/chat/completions', (req, res) => {
  const { stream } = req.body;
  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const words = 'Hello! This is a mock streaming response from the Ultralisk Console stub API. You can use this to test the Playground UI.'.split(' ');
    let i = 0;
    const interval = setInterval(() => {
      if (i >= words.length) {
        res.write(`data: {"id":"chatcmpl-mock","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        clearInterval(interval);
        return;
      }
      res.write(`data: {"id":"chatcmpl-mock","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"${words[i]} "},"finish_reason":null}]}\n\n`);
      i++;
    }, 80);
    req.on('close', () => clearInterval(interval));
  } else {
    res.json({
      id: 'chatcmpl-mock',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: req.body.model ?? 'llama-3.1-8b-instruct',
      choices: [{ index: 0, message: { role: 'assistant', content: 'Hello! This is a mock response from the Ultralisk Console stub API.' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
    });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Ultralisk Console API stub running on http://localhost:${PORT}`);
});
