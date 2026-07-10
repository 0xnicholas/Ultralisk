# Task for worker

You are implementing Task 2: Types, Sidebar, Routes for Phase 1b

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

Task 1 (stub API) is done. Read the existing files before making changes.

## Step 1: Add Phase 1b types

Read `packages/console-ui/src/types/index.ts` first. Append these interfaces AFTER the existing ones:

```typescript
// === Endpoints ===
export interface Endpoint {
  id: string;
  name: string;
  model_id: string;
  type: 'serverless' | 'reserved' | 'dedicated';
  replicas: number;
  gpu_spec: { type: string; count: number };
  autoscaling_policy: { min_replicas: number; max_replicas: number; target_cpu_util: number } | null;
  metrics: { qps: number; ttft_p95_ms: number; tpot_ms: number; error_rate: number; gpu_util: number };
  status: 'active' | 'degraded' | 'creating' | 'deleted';
  created_at: string;
}

export interface CreateEndpointRequest {
  name: string;
  model_id: string;
  type: 'reserved' | 'dedicated';
  replicas?: number;
  gpu_spec?: { type: string; count: number };
  autoscaling_policy?: { min_replicas: number; max_replicas: number; target_cpu_util: number };
}

// === Batch Jobs ===
export interface BatchJob {
  id: string;
  name: string;
  model_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input_file: string;
  output_file: string | null;
  callback_url: string | null;
  token_count: number | null;
  cost: number | null;
  created_at: string;
  completed_at: string | null;
  error_log: { line: number; error: string }[] | null;
}

export interface CreateBatchJobRequest {
  name: string;
  model_id: string;
  input_file: string;
  callback_url?: string;
}

// === Backend Session (Phase 1b) ===
export interface BackendSession {
  id: string;
  name: string;
  model_id: string;
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
  created_at: string;
  updated_at: string;
}
```

## Step 2: Update Sidebar with Inference section

Read `packages/console-ui/src/components/Sidebar.tsx`. Add `IconTerminal2` and `IconBoxMultiple` to the icon imports, and add a new section after "Develop" and before "Organization":

New import line:
```typescript
import { IconTerminal2, IconBoxMultiple } from '@tabler/icons-react';
```

New section in NAV_ITEMS (insert between Develop section and Organization section):
```typescript
{ section: 'Inference', items: [
  { label: 'Endpoints', icon: IconTerminal2, path: '/endpoints' },
  { label: 'Batch Jobs', icon: IconBoxMultiple, path: '/batch-jobs' },
]},
```

## Step 3: Add routes to App.tsx

Read `packages/console-ui/src/App.tsx`. Add these imports:
```typescript
import { EndpointsPage } from '@/pages/endpoints/EndpointsPage';
import { CreateEndpointPage } from '@/pages/endpoints/CreateEndpointPage';
import { EndpointDetailPage } from '@/pages/endpoints/EndpointDetailPage';
import { BatchJobsPage } from '@/pages/batch-jobs/BatchJobsPage';
import { CreateBatchJobPage } from '@/pages/batch-jobs/CreateBatchJobPage';
import { BatchJobDetailPage } from '@/pages/batch-jobs/BatchJobDetailPage';
```

But these pages don't exist yet — create placeholder files so App.tsx doesn't break:

Create `packages/console-ui/src/pages/endpoints/EndpointsPage.tsx`:
```typescript
export function EndpointsPage() { return null; }
```

Similarly create placeholders for all 6 page components (return null). This keeps App.tsx happy until Tasks 3 and 4 implement them.

## Step 4: Add routes inside ConsoleLayout

In App.tsx, add these routes inside the ConsoleLayout Route (after the settings/profile route):
```typescript
<Route path="/endpoints" element={<EndpointsPage />} />
<Route path="/endpoints/new" element={<CreateEndpointPage />} />
<Route path="/endpoints/:id" element={<EndpointDetailPage />} />
<Route path="/batch-jobs" element={<BatchJobsPage />} />
<Route path="/batch-jobs/new" element={<CreateBatchJobPage />} />
<Route path="/batch-jobs/:id" element={<BatchJobDetailPage />} />
```

## Step 5: Verify typecheck and commit

```bash
cd packages/console-ui && pnpm typecheck
git add packages/console-ui/src
git commit -m "feat: add Phase 1b types, Sidebar Inference section, and routes"
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