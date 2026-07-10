# Task for worker

You are implementing Task 4: Console API Stub Backend

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

Tasks 1-3 are done. You need to create the Express stub server with mock data.

## Step 1: Create fixtures file

Create `packages/console-api/src/fixtures.ts` with mock data. The file is ~280 lines. Write it with all the mock data for users, models, usage, billing, and api keys.

```typescript
export const MOCK_USER = {
  id: 'usr_001',
  email: 'dev@ultralisk.com',
  name: 'Alice Developer',
  avatar_url: null,
  role: 'admin' as const,
  org_id: 'org_001',
  org_name: 'Ultralisk Labs',
  created_at: '2026-07-01T00:00:00Z',
};

export const MOCK_JWT = 'mock-jwt-token-for-development';

export const MOCK_MODELS = [
  {
    id: 'llama-3.3-70b-instruct', display_name: 'Llama 3.3 70B Instruct', author: 'Meta',
    category: 'chat', description: "Meta's latest 70B parameter instruction-tuned model with strong reasoning capabilities.",
    capabilities: { context_window: 131072, max_output_tokens: 4096, json_mode: true, tool_calling: true, multi_modal: false, fine_tuning: false },
    pricing: { serverless: { input_per_1m_tokens: 0.59, output_per_1m_tokens: 0.79, cached_input_per_1m_tokens: 0.10 }, batch_discount_percent: 50 },
    deployment_types: ['serverless', 'dedicated'], status: 'available', version: 'fp8-quantized', featured: true, created_at: '2026-06-15T00:00:00Z',
  },
  {
    id: 'deepseek-v4-pro', display_name: 'DeepSeek V4 Pro', author: 'DeepSeek',
    category: 'chat', description: "DeepSeek's most capable model with Mixture of Experts architecture and long context.",
    capabilities: { context_window: 262144, max_output_tokens: 8192, json_mode: true, tool_calling: true, multi_modal: false, fine_tuning: false },
    pricing: { serverless: { input_per_1m_tokens: 1.20, output_per_1m_tokens: 2.40 }, batch_discount_percent: 50 },
    deployment_types: ['serverless', 'dedicated'], status: 'available', version: 'bf16', featured: true, created_at: '2026-06-20T00:00:00Z',
  },
  {
    id: 'qwen-2.5-72b', display_name: 'Qwen 2.5 72B', author: 'Alibaba',
    category: 'chat', description: "Alibaba's 72B model excelling at coding, math, and multilingual tasks.",
    capabilities: { context_window: 131072, max_output_tokens: 8192, json_mode: true, tool_calling: true, multi_modal: false, fine_tuning: true },
    pricing: { serverless: { input_per_1m_tokens: 0.90, output_per_1m_tokens: 0.90 }, batch_discount_percent: 50 },
    deployment_types: ['serverless'], status: 'available', version: 'fp8-quantized', featured: true, created_at: '2026-06-25T00:00:00Z',
  },
  {
    id: 'llama-3.1-8b-instruct', display_name: 'Llama 3.1 8B Instruct', author: 'Meta',
    category: 'chat', description: 'Fast and affordable 8B model for lightweight tasks and high-throughput applications.',
    capabilities: { context_window: 131072, max_output_tokens: 4096, json_mode: true, tool_calling: true, multi_modal: false, fine_tuning: true },
    pricing: { serverless: { input_per_1m_tokens: 0.06, output_per_1m_tokens: 0.06 }, batch_discount_percent: 50 },
    deployment_types: ['serverless'], status: 'available', version: 'fp8-quantized', featured: true, created_at: '2026-06-30T00:00:00Z',
  },
  {
    id: 'llama-3.2-vision-90b', display_name: 'Llama 3.2 Vision 90B', author: 'Meta',
    category: 'chat', description: "Meta's multimodal vision-language model for image understanding tasks.",
    capabilities: { context_window: 131072, max_output_tokens: 4096, json_mode: false, tool_calling: false, multi_modal: true, fine_tuning: false },
    pricing: { serverless: { input_per_1m_tokens: 1.50, output_per_1m_tokens: 3.00 }, batch_discount_percent: 50 },
    deployment_types: ['serverless'], status: 'available', version: 'fp16', featured: false, created_at: '2026-07-01T00:00:00Z',
  },
];

export const MODEL_DETAILS: Record<string, any> = {};
MOCK_MODELS.forEach((m) => {
  MODEL_DETAILS[m.id] = {
    ...m,
    usage_examples: {
      curl: `curl https://api.ultralisk.com/v1/chat/completions \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer $ULTRALISK_API_KEY" \\\n  -d '{"model":"${m.id}","messages":[{"role":"user","content":"Hello!"}]}'`,
      python: `from openai import OpenAI\n\nclient = OpenAI(\n  base_url="https://api.ultralisk.com/v1",\n  api_key="your-ultralisk-api-key"\n)\n\nresponse = client.chat.completions.create(\n  model="${m.id}",\n  messages=[{"role":"user","content":"Hello!"}]\n)\nprint(response.choices[0].message.content)`,
      typescript: `import OpenAI from 'openai';\n\nconst client = new OpenAI({\n  baseURL: 'https://api.ultralisk.com/v1',\n  apiKey: 'your-ultralisk-api-key',\n});\n\nconst response = await client.chat.completions.create({\n  model: '${m.id}',\n  messages: [{ role: 'user', content: 'Hello!' }],\n});\nconsole.log(response.choices[0].message.content);`,
    },
  };
});

export const MOCK_USAGE = {
  period: { from: '2026-07-01T00:00:00Z', to: '2026-07-10T23:59:59Z' },
  totals: { requests: 12450, input_tokens: 3_200_000, output_tokens: 890_000, cost_usd: 12.47 },
  by_model: [
    { model_id: 'llama-3.3-70b-instruct', model_display_name: 'Llama 3.3 70B', requests: 5200, input_tokens: 1_500_000, output_tokens: 400_000, cost_usd: 5.62 },
    { model_id: 'llama-3.1-8b-instruct', model_display_name: 'Llama 3.1 8B', requests: 6800, input_tokens: 1_600_000, output_tokens: 450_000, cost_usd: 6.84 },
  ],
  by_key: [
    { key_id: 'key_001', key_name: 'Production', key_prefix: 'ultr_...a1b', requests: 10000, input_tokens: 2_800_000, output_tokens: 750_000, cost_usd: 10.20 },
    { key_id: 'key_002', key_name: 'Development', key_prefix: 'ultr_...c2d', requests: 2450, input_tokens: 400_000, output_tokens: 140_000, cost_usd: 2.27 },
  ],
  recent_activity: Array.from({ length: 10 }, (_, i) => ({
    timestamp: new Date(Date.now() - i * 3600000).toISOString(),
    model_id: i % 2 === 0 ? 'llama-3.1-8b-instruct' : 'llama-3.3-70b-instruct',
    status_code: [200, 200, 200, 200, 200, 200, 200, 429, 500, 200][i],
    latency_ms: Math.floor(Math.random() * 500) + 100,
    tokens: Math.floor(Math.random() * 2000) + 100,
  })),
};

export const MOCK_BILLING = {
  balance_usd: 87.53,
  monthly_budget_usd: 100.00,
  month_to_date_spend_usd: 12.47,
  estimated_month_end_usd: 37.41,
  auto_recharge_enabled: true,
  invoices: [
    { id: 'inv_007', period: '2026-07', amount_usd: 12.47, status: 'pending' as const, download_url: '#', issued_at: '2026-07-01T00:00:00Z' },
    { id: 'inv_006', period: '2026-06', amount_usd: 45.20, status: 'paid' as const, download_url: '#', issued_at: '2026-06-01T00:00:00Z' },
    { id: 'inv_005', period: '2026-05', amount_usd: 32.80, status: 'paid' as const, download_url: '#', issued_at: '2026-05-01T00:00:00Z' },
  ],
};

export const MOCK_API_KEYS = [
  { id: 'key_001', name: 'Production', prefix: 'ultr_...a1b', role: 'admin' as const, model_allowlist: null, monthly_quota_usd: 50, usage_this_month_usd: 10.20, created_by: 'Alice Developer', created_at: '2026-07-01T00:00:00Z', last_used_at: '2026-07-10T14:30:00Z', revoked_at: null, status: 'active' as const },
  { id: 'key_002', name: 'Development', prefix: 'ultr_...c2d', role: 'developer' as const, model_allowlist: ['llama-3.1-8b-instruct'], monthly_quota_usd: 25, usage_this_month_usd: 2.27, created_by: 'Alice Developer', created_at: '2026-07-03T00:00:00Z', last_used_at: '2026-07-10T12:15:00Z', revoked_at: null, status: 'active' as const },
];
```

## Step 2: Create Express stub server

Create `packages/console-api/src/index.ts`:

```typescript
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
```

## Step 3: Verify API stub starts

```bash
cd packages/console-api && timeout 3 pnpm dev || true
```
Expected: shows "Ultralisk Console API stub running on http://localhost:3001"

## Step 4: Test endpoints with curl

```bash
# Start server in background
cd packages/console-api && pnpm dev &
sleep 2

# Test endpoints
curl -s http://localhost:3001/v1/admin/models | head -c 100
curl -s -X POST http://localhost:3001/v1/admin/auth/login -H 'Content-Type: application/json' -d '{}' | head -c 100

# Kill background server
kill %1 2>/dev/null
```

## Step 5: Commit

```bash
git add packages/console-api/src
git commit -m "feat: add console-api Express stub with mock fixtures for all Phase 1a endpoints"
```

## Acceptance Contract
Acceptance level: checked
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope

Required evidence: changed-files, tests-added, commands-run, residual-risks, no-staged-files

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```