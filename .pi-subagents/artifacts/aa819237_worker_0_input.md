# Task for worker

You are implementing Task 1: Stub API — Endpoints, Batch Jobs, Sessions

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

Tasks 1-11 of Phase 1a are already complete. The API stub at `packages/console-api/src/index.ts` and `fixtures.ts` already exist. You need to EXTEND them with Phase 1b endpoints.

## Step 1: Append mock fixtures to fixtures.ts

Open and read `packages/console-api/src/fixtures.ts` first. Then append these exports at the END of the file:

```typescript
export const MOCK_ENDPOINTS = [
  {
    id: 'ep_001', name: 'llama-prod', model_id: 'llama-3.3-70b-instruct', type: 'dedicated',
    replicas: 2, gpu_spec: { type: 'H100', count: 2 },
    autoscaling_policy: { min_replicas: 1, max_replicas: 4, target_cpu_util: 70 },
    metrics: { qps: 45.2, ttft_p95_ms: 320, tpot_ms: 45, error_rate: 0.02, gpu_util: 68 },
    status: 'active', created_at: '2026-07-05T00:00:00Z',
  },
  {
    id: 'ep_002', name: 'deepseek-reserved', model_id: 'deepseek-v4-pro', type: 'reserved',
    replicas: 1, gpu_spec: { type: 'H100', count: 1 },
    autoscaling_policy: { min_replicas: 1, max_replicas: 2, target_cpu_util: 80 },
    metrics: { qps: 12.1, ttft_p95_ms: 510, tpot_ms: 72, error_rate: 0.01, gpu_util: 55 },
    status: 'active', created_at: '2026-07-08T00:00:00Z',
  },
  {
    id: 'ep_003', name: 'qwen-dev', model_id: 'qwen-2.5-72b', type: 'reserved',
    replicas: 1, gpu_spec: { type: 'H100', count: 1 }, autoscaling_policy: null,
    metrics: { qps: 3.4, ttft_p95_ms: 890, tpot_ms: 120, error_rate: 0.05, gpu_util: 22 },
    status: 'degraded', created_at: '2026-07-09T00:00:00Z',
  },
];

export const MOCK_BATCH_JOBS = [
  { id: 'batch_001', name: 'summarization-jul9', model_id: 'llama-3.3-70b-instruct', status: 'completed', input_file: 'summaries_input.jsonl', output_file: 'summaries_output.jsonl', callback_url: null, token_count: 1_250_000, cost: 0.74, created_at: '2026-07-09T10:00:00Z', completed_at: '2026-07-09T10:45:00Z', error_log: null },
  { id: 'batch_002', name: 'classification-batch', model_id: 'llama-3.1-8b-instruct', status: 'running', input_file: 'classify_input.jsonl', output_file: null, callback_url: 'https://hooks.example.com/classify-done', token_count: 320_000, cost: null, created_at: '2026-07-10T14:00:00Z', completed_at: null, error_log: null },
  { id: 'batch_003', name: 'embeddings-v2', model_id: 'qwen-2.5-72b', status: 'failed', input_file: 'embeddings_input.jsonl', output_file: null, callback_url: null, token_count: 50_000, cost: 0.03, created_at: '2026-07-08T09:00:00Z', completed_at: '2026-07-08T09:05:00Z', error_log: [{ line: 142, error: 'Invalid JSON format - unterminated string' }] },
  { id: 'batch_004', name: 'bulk-translate', model_id: 'llama-3.1-8b-instruct', status: 'pending', input_file: 'translate_input.jsonl', output_file: null, callback_url: 'https://hooks.example.com/translate-done', token_count: null, cost: null, created_at: '2026-07-10T15:30:00Z', completed_at: null, error_log: null },
];

export const MOCK_SESSIONS = [
  { id: 'sess_001', name: 'API Design Discussion', model_id: 'llama-3.3-70b-instruct', messages: [{ role: 'user', content: 'Design a REST API for a task queue' }, { role: 'assistant', content: 'Here is a REST API design for a task queue...' }], created_at: '2026-07-10T10:00:00Z', updated_at: '2026-07-10T10:30:00Z' },
  { id: 'sess_002', name: 'Code Review', model_id: 'llama-3.1-8b-instruct', messages: [{ role: 'user', content: 'Review this TypeScript code...' }], created_at: '2026-07-10T11:00:00Z', updated_at: '2026-07-10T11:05:00Z' },
];
```

## Step 2: Add stub endpoint handlers to index.ts

Open and read `packages/console-api/src/index.ts`. Add these handlers BEFORE the SSE chat completions section (before `// === Chat completions (SSE stub) ===`):

```typescript
// === Endpoints ===
app.get('/v1/admin/endpoints', (_req, res) => {
  res.json({ data: MOCK_ENDPOINTS, pagination: { page: 1, limit: 20, total: MOCK_ENDPOINTS.length } });
});

app.get('/v1/admin/endpoints/:id', (req, res) => {
  const ep = MOCK_ENDPOINTS.find((e) => e.id === req.params.id);
  if (!ep) return res.status(404).json({ error: { code: 'not_found', message: 'Endpoint not found' } });
  res.json({ data: ep });
});

app.post('/v1/admin/endpoints', (req, res) => {
  const body = req.body;
  const ep = { id: `ep_${Date.now()}`, name: body.name, model_id: body.model_id, type: body.type, replicas: body.replicas ?? 1, gpu_spec: body.gpu_spec ?? { type: 'H100', count: 1 }, autoscaling_policy: body.autoscaling_policy ?? null, metrics: { qps: 0, ttft_p95_ms: 0, tpot_ms: 0, error_rate: 0, gpu_util: 0 }, status: 'creating', created_at: new Date().toISOString() };
  MOCK_ENDPOINTS.push(ep);
  res.status(201).json({ data: ep });
});

app.patch('/v1/admin/endpoints/:id', (req, res) => {
  const idx = MOCK_ENDPOINTS.findIndex((e) => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: { code: 'not_found', message: 'Endpoint not found' } });
  MOCK_ENDPOINTS[idx] = { ...MOCK_ENDPOINTS[idx], ...req.body };
  res.json({ data: MOCK_ENDPOINTS[idx] });
});

app.delete('/v1/admin/endpoints/:id', (req, res) => {
  const idx = MOCK_ENDPOINTS.findIndex((e) => e.id === req.params.id);
  if (idx === -1) return res.status(404).send();
  MOCK_ENDPOINTS.splice(idx, 1);
  res.status(204).send();
});

// === Batch Jobs ===
app.get('/v1/admin/batch-jobs', (_req, res) => {
  res.json({ data: MOCK_BATCH_JOBS, pagination: { page: 1, limit: 20, total: MOCK_BATCH_JOBS.length } });
});

app.get('/v1/admin/batch-jobs/:id', (req, res) => {
  const job = MOCK_BATCH_JOBS.find((j) => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: { code: 'not_found', message: 'Batch job not found' } });
  res.json({ data: job });
});

app.post('/v1/admin/batch-jobs', (req, res) => {
  const body = req.body;
  const job = { id: `batch_${Date.now()}`, name: body.name, model_id: body.model_id, status: 'pending', input_file: body.input_file, output_file: null, callback_url: body.callback_url ?? null, token_count: null, cost: null, created_at: new Date().toISOString(), completed_at: null, error_log: null };
  MOCK_BATCH_JOBS.unshift(job);
  res.status(201).json({ data: job });
});

app.delete('/v1/admin/batch-jobs/:id', (req, res) => {
  const idx = MOCK_BATCH_JOBS.findIndex((j) => j.id === req.params.id);
  if (idx === -1) return res.status(404).send();
  MOCK_BATCH_JOBS.splice(idx, 1);
  res.status(204).send();
});

// === Sessions (Playground backend persistence) ===
app.get('/v1/admin/sessions', (_req, res) => {
  res.json({ data: MOCK_SESSIONS, pagination: { page: 1, limit: 20, total: MOCK_SESSIONS.length } });
});

app.post('/v1/admin/sessions', (req, res) => {
  const body = req.body;
  const session = { id: `sess_${Date.now()}`, name: body.name ?? 'New Chat', model_id: body.model_id ?? 'llama-3.1-8b-instruct', messages: body.messages ?? [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  MOCK_SESSIONS.unshift(session);
  res.status(201).json({ data: session });
});

app.patch('/v1/admin/sessions/:id', (req, res) => {
  const idx = MOCK_SESSIONS.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: { code: 'not_found', message: 'Session not found' } });
  MOCK_SESSIONS[idx] = { ...MOCK_SESSIONS[idx], ...req.body, updated_at: new Date().toISOString() };
  res.json({ data: MOCK_SESSIONS[idx] });
});

app.delete('/v1/admin/sessions/:id', (req, res) => {
  const idx = MOCK_SESSIONS.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).send();
  MOCK_SESSIONS.splice(idx, 1);
  res.status(204).send();
});
```

Also add imports at the top of index.ts — add to the existing import:
```typescript
import { MOCK_USER, MOCK_JWT, MOCK_MODELS, MODEL_DETAILS, MOCK_USAGE, MOCK_BILLING, MOCK_API_KEYS, MOCK_ENDPOINTS, MOCK_BATCH_JOBS, MOCK_SESSIONS } from './fixtures.js';
```

## Step 3: Verify API stub starts and test new endpoints

```bash
cd packages/console-api && pnpm dev &
sleep 2
echo "=== Endpoints ===" && curl -s http://localhost:3100/v1/admin/endpoints | python3 -c "import sys,json; d=json.load(sys.stdin); print('List:', len(d['data']), 'endpoints')"
echo "=== Endpoint by ID ===" && curl -s http://localhost:3100/v1/admin/endpoints/ep_001 | python3 -c "import sys,json; d=json.load(sys.stdin); print('Detail:', d['data']['name'])"
echo "=== Batch Jobs ===" && curl -s http://localhost:3100/v1/admin/batch-jobs | python3 -c "import sys,json; d=json.load(sys.stdin); print('List:', len(d['data']), 'jobs')"
echo "=== Batch Job by ID ===" && curl -s http://localhost:3100/v1/admin/batch-jobs/batch_001 | python3 -c "import sys,json; d=json.load(sys.stdin); print('Detail:', d['data']['name'])"
echo "=== Sessions ===" && curl -s http://localhost:3100/v1/admin/sessions | python3 -c "import sys,json; d=json.load(sys.stdin); print('List:', len(d['data']), 'sessions')"
kill %1 2>/dev/null
```

## Step 4: Commit

```bash
git add packages/console-api/src
git commit -m "feat(api): add stub endpoints for Endpoints, Batch Jobs, and Sessions"
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