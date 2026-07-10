# Task for worker

You are implementing Phase 2b Task 1: Stub API — GPU Utilization

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

Phase 2a is done. EXTEND the API stub with GPU Utilization data.

## Step 1: Append mock data to fixtures.ts

Read `packages/console-api/src/fixtures.ts`. Append at the END:

```typescript
// === GPU Utilization (Phase 2b) ===
const __HOURS = Array.from({ length: 72 }, (_, i) => new Date(Date.now() - (71 - i) * 3600000).toISOString());

export const MOCK_GPU_UTILIZATION = {
  overview: { total_gpu: 64, avg_utilization: 62, idle_gpu: 14, queued_requests: 3 },
  time_series: __HOURS.map((timestamp: string, i: number) => ({
    timestamp,
    avg_utilization: Math.floor(Math.random() * 40 + 40),
    idle_count: Math.floor(Math.random() * 6 + 2),
    queued_count: Math.floor(Math.random() * 8),
  })),
  per_model: [
    { model_id: 'llama-3.3-70b-instruct', model_display: 'Llama 3.3 70B', gpu_allocated: 24, gpu_utilization: 78, requests_per_sec: 45.2 },
    { model_id: 'llama-3.1-8b-instruct', model_display: 'Llama 3.1 8B', gpu_allocated: 8, gpu_utilization: 92, requests_per_sec: 320.0 },
    { model_id: 'deepseek-v4-pro', model_display: 'DeepSeek V4 Pro', gpu_allocated: 16, gpu_utilization: 55, requests_per_sec: 12.1 },
    { model_id: 'qwen-2.5-72b', model_display: 'Qwen 2.5 72B', gpu_allocated: 8, gpu_utilization: 34, requests_per_sec: 3.4 },
    { model_id: 'llama-3.2-vision-90b', model_display: 'Llama 3.2 Vision 90B', gpu_allocated: 8, gpu_utilization: 41, requests_per_sec: 1.8 },
  ],
  per_tenant: [
    { tenant: 'platform-engineering', gpu_allocated: 32, gpu_utilization: 71, token_usage: 5_200_000, cost_usd: 420.50 },
    { tenant: 'ml-research', gpu_allocated: 16, gpu_utilization: 58, token_usage: 2_800_000, cost_usd: 215.30 },
    { tenant: 'data-science', gpu_allocated: 8, gpu_utilization: 43, token_usage: 890_000, cost_usd: 68.20 },
    { tenant: 'internal-tools', gpu_allocated: 8, gpu_utilization: 29, token_usage: 340_000, cost_usd: 25.80 },
  ],
};
```

## Step 2: Add endpoint to index.ts

Read `packages/console-api/src/index.ts`. Update the import to include MOCK_GPU_UTILIZATION:
```typescript
import {
  MOCK_USER, MOCK_JWT, MOCK_MODELS, MODEL_DETAILS, MOCK_USAGE, MOCK_BILLING,
  MOCK_API_KEYS, MOCK_ENDPOINTS, MOCK_BATCH_JOBS, MOCK_SESSIONS,
  MOCK_CLUSTERS, MOCK_NODES, MOCK_GPU_CARDS, MOCK_DEPLOYMENTS, MOCK_DEPLOYMENT_VERSIONS,
  MOCK_GPU_UTILIZATION,
} from './fixtures.js';
```

Add handler BEFORE `// === Chat completions (SSE stub) ===`:
```typescript
// === GPU Utilization (Phase 2b) ===
app.get('/v1/admin/gpu-utilization', (_req, res) => {
  res.json({ data: MOCK_GPU_UTILIZATION });
});
```

## Step 3: Verify and commit

```bash
cd packages/console-api && pnpm dev &
sleep 2
curl -s http://localhost:3100/v1/admin/gpu-utilization | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print('Time series:', len(d['time_series']), '| Models:', len(d['per_model']), '| Tenants:', len(d['per_tenant']))"
kill %1 2>/dev/null
git add packages/console-api/src
git commit -m "feat(api): add GPU utilization mock data and endpoint"
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