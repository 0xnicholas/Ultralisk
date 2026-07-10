# Ultralisk Console Phase 1b Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Phase 1a MVP with Endpoints, Batch Jobs, Playground backend persistence, Playground enhancements (API view, message editing, multi-modal), and Billing polish.

**Architecture:** Same monorepo as Phase 1a. New pages under Inference section (Endpoints + Batch Jobs). Playground migration from localStorage-only to hybrid (localStorage + backend API for logged-in users). Stub backend gains new endpoints for sessions, endpoints, batch-jobs.

**Tech Stack:** Same as Phase 1a — React 19.2, TypeScript, Mantine v9, @mantine/charts, @tanstack/react-query v5, React Router v7, Vite 6

**Reference specs:**
- Design: `docs/superpowers/specs/2026-07-10-ultralisk-console-design.md` (§5.4 Phase 1b routes, §6.5 Endpoints, §6.6 Batch Jobs, §6.7 Billing, §15 open question #6)
- Competitive analysis: `docs/superpowers/specs/2026-07-10-console-competitive-analysis.md` (§2.6 Endpoints, §2.5 Billing)

---

## File Structure (new/modified files)

```
packages/console-ui/src/
├── types/index.ts                       # MODIFY: add Endpoint, BatchJob, PlaygroundSession (backend)
├── App.tsx                              # MODIFY: add Inference sidebar section + new routes
├── components/
│   └── Sidebar.tsx                      # MODIFY: add Inference section (Endpoints, Batch Jobs)
├── pages/
│   ├── endpoints/
│   │   ├── EndpointsPage.tsx            # CREATE
│   │   ├── CreateEndpointPage.tsx       # CREATE
│   │   └── EndpointDetailPage.tsx       # CREATE
│   ├── batch-jobs/
│   │   ├── BatchJobsPage.tsx            # CREATE
│   │   ├── CreateBatchJobPage.tsx       # CREATE
│   │   └── BatchJobDetailPage.tsx       # CREATE
│   ├── playground/
│   │   └── PlaygroundPage.tsx           # MODIFY: backend persistence, API view, editing, multi-modal
│   └── billing/
│       └── BillingPage.tsx              # MODIFY: time range, download buttons
├── components/
│   ├── playground/
│   │   ├── ApiViewModal.tsx             # CREATE (code generation modal)
│   │   └── PlaygroundPage.tsx... (modified)
│   ├── endpoints/
│   │   ├── EndpointList.tsx             # CREATE
│   │   ├── CreateEndpointForm.tsx       # CREATE
│   │   ├── EndpointMetrics.tsx          # CREATE
│   │   └── AutoscalingPolicy.tsx        # CREATE
│   └── batch-jobs/
│       ├── BatchJobList.tsx             # CREATE
│       ├── CreateBatchJobForm.tsx       # CREATE
│       └── BatchJobStatusBadge.tsx      # CREATE
├── api/
│   ├── endpoints.ts                     # CREATE
│   ├── batchJobs.ts                     # CREATE
│   └── sessions.ts                      # CREATE (backend session persistence)
├── hooks/
│   ├── useEndpoints.ts                  # CREATE
│   ├── useBatchJobs.ts                  # CREATE
│   └── useSessions.ts                   # CREATE (backend session API)

packages/console-api/src/
├── fixtures.ts                          # MODIFY: add mock endpoints, batch jobs, sessions
└── index.ts                             # MODIFY: add new endpoint handlers
```

---

## Task 1: Stub API — Endpoints, Batch Jobs, Sessions

**Files:**
- Modify: `packages/console-api/src/fixtures.ts` (add mock data)
- Modify: `packages/console-api/src/index.ts` (add endpoints)

- [ ] **Step 1: Add mock fixtures**

Append to `packages/console-api/src/fixtures.ts`:

```typescript
export const MOCK_ENDPOINTS = [
  {
    id: 'ep_001', name: 'llama-prod', model_id: 'llama-3.3-70b-instruct', type: 'dedicated',
    replicas: 2, gpu_spec: { type: 'H100', count: 2 }, autoscaling_policy: { min_replicas: 1, max_replicas: 4, target_cpu_util: 70 },
    metrics: { qps: 45.2, ttft_p95_ms: 320, tpot_ms: 45, error_rate: 0.02, gpu_util: 68 },
    status: 'active', created_at: '2026-07-05T00:00:00Z',
  },
  {
    id: 'ep_002', name: 'deepseek-reserved', model_id: 'deepseek-v4-pro', type: 'reserved',
    replicas: 1, gpu_spec: { type: 'H100', count: 1 }, autoscaling_policy: { min_replicas: 1, max_replicas: 2, target_cpu_util: 80 },
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
  {
    id: 'batch_001', name: 'summarization-jul9', model_id: 'llama-3.3-70b-instruct', status: 'completed',
    input_file: 'summaries_input.jsonl', output_file: 'summaries_output.jsonl', callback_url: null,
    token_count: 1_250_000, cost: 0.74, created_at: '2026-07-09T10:00:00Z', completed_at: '2026-07-09T10:45:00Z',
    error_log: null,
  },
  {
    id: 'batch_002', name: 'classification-batch', model_id: 'llama-3.1-8b-instruct', status: 'running',
    input_file: 'classify_input.jsonl', output_file: null, callback_url: 'https://hooks.example.com/classify-done',
    token_count: 320_000, cost: null, created_at: '2026-07-10T14:00:00Z', completed_at: null,
    error_log: null,
  },
  {
    id: 'batch_003', name: 'embeddings-v2', model_id: 'qwen-2.5-72b', status: 'failed',
    input_file: 'embeddings_input.jsonl', output_file: null, callback_url: null,
    token_count: 50_000, cost: 0.03, created_at: '2026-07-08T09:00:00Z', completed_at: '2026-07-08T09:05:00Z',
    error_log: [{ line: 142, error: 'Invalid JSON format - unterminated string' }],
  },
  {
    id: 'batch_004', name: 'bulk-translate', model_id: 'llama-3.1-8b-instruct', status: 'pending',
    input_file: 'translate_input.jsonl', output_file: null, callback_url: 'https://hooks.example.com/translate-done',
    token_count: null, cost: null, created_at: '2026-07-10T15:30:00Z', completed_at: null,
    error_log: null,
  },
];

export const MOCK_SESSIONS = [
  { id: 'sess_001', name: 'API Design Discussion', model_id: 'llama-3.3-70b-instruct', messages: [
    { role: 'user', content: 'Design a REST API for a task queue' },
    { role: 'assistant', content: 'Here is a REST API design for a task queue...' },
  ], created_at: '2026-07-10T10:00:00Z', updated_at: '2026-07-10T10:30:00Z' },
  { id: 'sess_002', name: 'Code Review', model_id: 'llama-3.1-8b-instruct', messages: [
    { role: 'user', content: 'Review this TypeScript code...' },
  ], created_at: '2026-07-10T11:00:00Z', updated_at: '2026-07-10T11:05:00Z' },
];
```

- [ ] **Step 2: Add stub endpoint handlers**

Add to `packages/console-api/src/index.ts` (before the SSE chat completions section):

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
  const ep = {
    id: `ep_${Date.now()}`, name: body.name, model_id: body.model_id, type: body.type,
    replicas: body.replicas ?? 1, gpu_spec: body.gpu_spec ?? { type: 'H100', count: 1 },
    autoscaling_policy: body.autoscaling_policy ?? null,
    metrics: { qps: 0, ttft_p95_ms: 0, tpot_ms: 0, error_rate: 0, gpu_util: 0 },
    status: 'creating', created_at: new Date().toISOString(),
  };
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
  const job = {
    id: `batch_${Date.now()}`, name: body.name, model_id: body.model_id, status: 'pending',
    input_file: body.input_file, output_file: null, callback_url: body.callback_url ?? null,
    token_count: null, cost: null, created_at: new Date().toISOString(), completed_at: null, error_log: null,
  };
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
  const session = {
    id: `sess_${Date.now()}`, name: body.name ?? 'New Chat', model_id: body.model_id ?? 'llama-3.1-8b-instruct',
    messages: body.messages ?? [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
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

- [ ] **Step 3: Verify API stub starts and test new endpoints**

```bash
cd packages/console-api && pnpm dev &
sleep 2
curl -s http://localhost:3100/v1/admin/endpoints | python3 -c "import sys,json; d=json.load(sys.stdin); print('Endpoints:', len(d['data']))"
curl -s http://localhost:3100/v1/admin/batch-jobs | python3 -c "import sys,json; d=json.load(sys.stdin); print('Batch Jobs:', len(d['data']))"
curl -s http://localhost:3100/v1/admin/sessions | python3 -c "import sys,json; d=json.load(sys.stdin); print('Sessions:', len(d['data']))"
kill %1 2>/dev/null
```

- [ ] **Step 4: Commit**

```bash
git add packages/console-api/src
git commit -m "feat(api): add stub endpoints for Endpoints, Batch Jobs, and Sessions"
```

---

## Task 2: Types, Sidebar, and Routes for Phase 1b

**Files:**
- Modify: `packages/console-ui/src/types/index.ts`
- Modify: `packages/console-ui/src/components/Sidebar.tsx`
- Modify: `packages/console-ui/src/App.tsx`

- [ ] **Step 1: Add Phase 1b types**

Add to `packages/console-ui/src/types/index.ts` after the existing interfaces:

```typescript
// === Endpoints ===
export interface Endpoint {
  id: string;
  name: string;
  model_id: string;
  type: 'serverless' | 'reserved' | 'dedicated';
  replicas: number;
  gpu_spec: { type: string; count: number };
  autoscaling_policy: {
    min_replicas: number;
    max_replicas: number;
    target_cpu_util: number;
  } | null;
  metrics: {
    qps: number;
    ttft_p95_ms: number;
    tpot_ms: number;
    error_rate: number;
    gpu_util: number;
  };
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

- [ ] **Step 2: Update Sidebar with Inference section**

Edit `packages/console-ui/src/components/Sidebar.tsx` — add import:
```typescript
import { IconTerminal2, IconBoxMultiple } from '@tabler/icons-react';
```

Add a new section after "Develop" and before "Organization":
```typescript
{ section: 'Inference', items: [
  { label: 'Endpoints', icon: IconTerminal2, path: '/endpoints' },
  { label: 'Batch Jobs', icon: IconBoxMultiple, path: '/batch-jobs' },
]},
```

- [ ] **Step 3: Add routes to App.tsx**

Add imports:
```typescript
import { EndpointsPage } from '@/pages/endpoints/EndpointsPage';
import { CreateEndpointPage } from '@/pages/endpoints/CreateEndpointPage';
import { EndpointDetailPage } from '@/pages/endpoints/EndpointDetailPage';
import { BatchJobsPage } from '@/pages/batch-jobs/BatchJobsPage';
import { CreateBatchJobPage } from '@/pages/batch-jobs/CreateBatchJobPage';
import { BatchJobDetailPage } from '@/pages/batch-jobs/BatchJobDetailPage';
```

Add routes inside ConsoleLayout:
```typescript
<Route path="/endpoints" element={<EndpointsPage />} />
<Route path="/endpoints/new" element={<CreateEndpointPage />} />
<Route path="/endpoints/:id" element={<EndpointDetailPage />} />
<Route path="/batch-jobs" element={<BatchJobsPage />} />
<Route path="/batch-jobs/new" element={<CreateBatchJobPage />} />
<Route path="/batch-jobs/:id" element={<BatchJobDetailPage />} />
```

- [ ] **Step 4: Commit**

```bash
git add packages/console-ui/src/types/index.ts packages/console-ui/src/components/Sidebar.tsx packages/console-ui/src/App.tsx
git commit -m "feat: add Phase 1b types, Sidebar Inference section, and routes"
```

---

## Task 3: Endpoints Page

**Files:**
- Create: `packages/console-ui/src/api/endpoints.ts`
- Create: `packages/console-ui/src/hooks/useEndpoints.ts`
- Create: `packages/console-ui/src/components/endpoints/EndpointList.tsx`
- Create: `packages/console-ui/src/components/endpoints/CreateEndpointForm.tsx`
- Create: `packages/console-ui/src/components/endpoints/EndpointMetrics.tsx`
- Create: `packages/console-ui/src/components/endpoints/AutoscalingPolicy.tsx`
- Create: `packages/console-ui/src/pages/endpoints/EndpointsPage.tsx`
- Create: `packages/console-ui/src/pages/endpoints/CreateEndpointPage.tsx`
- Create: `packages/console-ui/src/pages/endpoints/EndpointDetailPage.tsx`

- [ ] **Step 1: Create API + hooks**

Write `packages/console-ui/src/api/endpoints.ts`:

```typescript
import { apiFetch } from './client';
import type { PaginatedResponse, SingleResponse, Endpoint, CreateEndpointRequest } from '@/types';

export async function getEndpoints() { return apiFetch<PaginatedResponse<Endpoint>>('/v1/admin/endpoints'); }
export async function getEndpoint(id: string) { return apiFetch<SingleResponse<Endpoint>>(`/v1/admin/endpoints/${id}`); }
export async function createEndpoint(data: CreateEndpointRequest) { return apiFetch<SingleResponse<Endpoint>>('/v1/admin/endpoints', { method: 'POST', body: JSON.stringify(data) }); }
export async function updateEndpoint(id: string, data: Partial<Endpoint>) { return apiFetch<SingleResponse<Endpoint>>(`/v1/admin/endpoints/${id}`, { method: 'PATCH', body: JSON.stringify(data) }); }
export async function deleteEndpoint(id: string) { return apiFetch<void>(`/v1/admin/endpoints/${id}`, { method: 'DELETE' }); }
```

Write `packages/console-ui/src/hooks/useEndpoints.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEndpoints, getEndpoint, createEndpoint, updateEndpoint, deleteEndpoint } from '@/api/endpoints';
import type { CreateEndpointRequest } from '@/types';

export function useEndpoints() { return useQuery({ queryKey: ['endpoints'], queryFn: () => getEndpoints().then((r) => r.data) }); }
export function useEndpoint(id: string) { return useQuery({ queryKey: ['endpoints', id], queryFn: () => getEndpoint(id).then((r) => r.data), enabled: !!id }); }
export function useCreateEndpoint() { const qc = useQueryClient(); return useMutation({ mutationFn: (d: CreateEndpointRequest) => createEndpoint(d).then((r) => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['endpoints'] }) }); }
export function useUpdateEndpoint() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, data }: { id: string; data: Partial<Endpoint> }) => updateEndpoint(id, data).then((r) => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['endpoints'] }) }); }
export function useDeleteEndpoint() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => deleteEndpoint(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['endpoints'] }) }); }
```

- [ ] **Step 2: Create EndpointList**

Write `packages/console-ui/src/components/endpoints/EndpointList.tsx`:

```typescript
import { Table, Badge, Text, Group, ActionIcon, Skeleton, Tooltip } from '@mantine/core';
import { IconEye, IconTrash } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useEndpoints, useDeleteEndpoint } from '@/hooks/useEndpoints';
import type { Endpoint } from '@/types';

export function EndpointList() {
  const { data: endpoints, isLoading } = useEndpoints();
  const deleteMutation = useDeleteEndpoint();
  const navigate = useNavigate();

  const rows = (endpoints ?? []).map((ep: Endpoint) => (
    <Table.Tr key={ep.id}>
      <Table.Td>
        <Text size="sm" fw={500}>{ep.name}</Text>
        <Text size="xs" c="dimmed">{ep.model_id}</Text>
      </Table.Td>
      <Table.Td><Badge variant="light" size="sm" color={ep.type === 'dedicated' ? 'violet' : 'blue'}>{ep.type}</Badge></Table.Td>
      <Table.Td><Text size="sm">{ep.replicas}x {ep.gpu_spec.type}</Text></Table.Td>
      <Table.Td><Text size="sm">{ep.metrics.qps} QPS</Text></Table.Td>
      <Table.Td><Badge variant="dot" size="sm" color={ep.status === 'active' ? 'green' : ep.status === 'degraded' ? 'yellow' : 'red'}>{ep.status}</Badge></Table.Td>
      <Table.Td>
        <Group gap={4}>
          <Tooltip label="View details"><ActionIcon variant="light" size="sm" onClick={() => navigate(`/endpoints/${ep.id}`)}><IconEye size={14} /></ActionIcon></Tooltip>
          <Tooltip label="Delete"><ActionIcon variant="light" color="red" size="sm" onClick={() => deleteMutation.mutate(ep.id)} loading={deleteMutation.isPending}><IconTrash size={14} /></ActionIcon></Tooltip>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Table striped highlightOnHover>
      <Table.Thead><Table.Tr>
        <Table.Th>Name</Table.Th><Table.Th>Type</Table.Th><Table.Th>GPU</Table.Th><Table.Th>Throughput</Table.Th><Table.Th>Status</Table.Th><Table.Th></Table.Th>
      </Table.Tr></Table.Thead>
      <Table.Tbody>{isLoading ? [1,2,3].map((i) => <Table.Tr key={i}>{[1,2,3,4,5,6].map((j) => <Table.Td key={j}><Skeleton height={20} /></Table.Td>)}</Table.Tr>) : rows}</Table.Tbody>
    </Table>
  );
}
```

- [ ] **Step 3: Create EndpointMetrics mini-card**

Write `packages/console-ui/src/components/endpoints/EndpointMetrics.tsx`:

```typescript
import { Paper, SimpleGrid, Text, Group } from '@mantine/core';
import type { Endpoint } from '@/types';

export function EndpointMetrics({ endpoint }: { endpoint: Endpoint }) {
  const metrics = [
    { label: 'QPS', value: endpoint.metrics.qps.toFixed(1), color: 'blue' },
    { label: 'TTFT p95', value: `${endpoint.metrics.ttft_p95_ms}ms`, color: 'violet' },
    { label: 'TPOT', value: `${endpoint.metrics.tpot_ms}ms`, color: 'green' },
    { label: 'Error Rate', value: `${endpoint.metrics.error_rate}%`, color: endpoint.metrics.error_rate > 1 ? 'red' : 'green' },
    { label: 'GPU Util', value: `${endpoint.metrics.gpu_util}%`, color: 'orange' },
  ];

  return (
    <SimpleGrid cols={5} mb="md">
      {metrics.map((m) => (
        <Paper key={m.label} withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{m.label}</Text>
          <Text size="lg" fw={700} c={m.color}>{m.value}</Text>
        </Paper>
      ))}
    </SimpleGrid>
  );
}
```

- [ ] **Step 4: Create AutoscalingPolicy**

Write `packages/console-ui/src/components/endpoints/AutoscalingPolicy.tsx`:

```typescript
import { Paper, Text, Group, Badge } from '@mantine/core';
import type { Endpoint } from '@/types';

export function AutoscalingPolicy({ endpoint }: { endpoint: Endpoint }) {
  if (!endpoint.autoscaling_policy) {
    return <Paper withBorder p="md" radius="md"><Text size="sm" c="dimmed">Autoscaling not configured</Text></Paper>;
  }

  const { min_replicas, max_replicas, target_cpu_util } = endpoint.autoscaling_policy;
  return (
    <Paper withBorder p="md" radius="md">
      <Text size="sm" fw={500} mb="xs">Autoscaling Policy</Text>
      <Group gap="md">
        <div><Text size="xs" c="dimmed">Min Replicas</Text><Text fw={600}>{min_replicas}</Text></div>
        <div><Text size="xs" c="dimmed">Max Replicas</Text><Text fw={600}>{max_replicas}</Text></div>
        <div><Text size="xs" c="dimmed">Target CPU</Text><Badge color="violet" variant="light">{target_cpu_util}%</Badge></div>
      </Group>
    </Paper>
  );
}
```

- [ ] **Step 5: Create EndpointsPage**

Write `packages/console-ui/src/pages/endpoints/EndpointsPage.tsx`:

```typescript
import { Title, Button, Group, Paper } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { EndpointList } from '@/components/endpoints/EndpointList';

export function EndpointsPage() {
  const navigate = useNavigate();
  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Endpoints</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/endpoints/new')}>Create Endpoint</Button>
      </Group>
      <Paper withBorder p="lg" radius="md"><EndpointList /></Paper>
    </>
  );
}
```

- [ ] **Step 6: Create CreateEndpointPage**

Write `packages/console-ui/src/pages/endpoints/CreateEndpointPage.tsx`:

```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Title, Paper, TextInput, Select, NumberInput, Button, Group, Stack, Text } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useCreateEndpoint } from '@/hooks/useEndpoints';
import { useModels } from '@/hooks/useModels';

export function CreateEndpointPage() {
  const navigate = useNavigate();
  const createMutation = useCreateEndpoint();
  const { data: models } = useModels();
  const [name, setName] = useState('');
  const [modelId, setModelId] = useState('');
  const [type, setType] = useState<'reserved' | 'dedicated'>('reserved');
  const [replicas, setReplicas] = useState(1);

  const modelOptions = (models ?? []).map((m) => ({ value: m.id, label: m.display_name }));
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMutation.mutateAsync({ name, model_id: modelId, type, replicas });
    navigate('/endpoints', { replace: true });
  };

  return (
    <>
      <Group mb="md"><Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/endpoints')}>Back to Endpoints</Button></Group>
      <Title order={2} mb="md">Create Endpoint</Title>
      <Paper withBorder p="lg" radius="md" maw={560}>
        <form onSubmit={handleSubmit}>
          <Stack>
            <TextInput label="Endpoint Name" placeholder="my-model-prod" required value={name} onChange={(e) => setName(e.currentTarget.value)} />
            <Select label="Model" placeholder="Select model" data={modelOptions} value={modelId} onChange={(v) => v && setModelId(v)} searchable required />
            <Select label="Type" data={[{ value: 'reserved', label: 'Reserved' }, { value: 'dedicated', label: 'Dedicated' }]} value={type} onChange={(v) => setType(v as 'reserved' | 'dedicated')} />
            <NumberInput label="Replicas" value={replicas} onChange={(v) => setReplicas(typeof v === 'number' ? v : 1)} min={1} max={10} />
            <Group justify="flex-end"><Button variant="default" onClick={() => navigate('/endpoints')}>Cancel</Button><Button type="submit" loading={createMutation.isPending}>Create Endpoint</Button></Group>
          </Stack>
        </form>
      </Paper>
    </>
  );
}
```

- [ ] **Step 7: Create EndpointDetailPage**

Write `packages/console-ui/src/pages/endpoints/EndpointDetailPage.tsx`:

```typescript
import { useParams, useNavigate } from 'react-router-dom';
import { Title, Paper, Text, Group, Button, Skeleton, Stack, Badge, SimpleGrid } from '@mantine/core';
import { IconArrowLeft, IconTrash } from '@tabler/icons-react';
import { useEndpoint, useDeleteEndpoint } from '@/hooks/useEndpoints';
import { EndpointMetrics } from '@/components/endpoints/EndpointMetrics';
import { AutoscalingPolicy } from '@/components/endpoints/AutoscalingPolicy';

export function EndpointDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: endpoint, isLoading } = useEndpoint(id ?? '');
  const deleteMutation = useDeleteEndpoint();

  if (isLoading) return <Skeleton height={400} />;
  if (!endpoint) return <Text c="red">Endpoint not found</Text>;

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(id!);
    navigate('/endpoints', { replace: true });
  };

  return (
    <>
      <Group mb="md"><Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/endpoints')}>Back</Button></Group>
      <Group justify="space-between" mb="md">
        <div>
          <Title order={2}>{endpoint.name}</Title>
          <Group gap="xs"><Text c="dimmed" size="sm">{endpoint.model_id}</Text><Badge variant="light" size="sm">{endpoint.type}</Badge></Group>
        </div>
        <Button color="red" variant="light" leftSection={<IconTrash size={16} />} onClick={handleDelete} loading={deleteMutation.isPending}>Delete</Button>
      </Group>
      <EndpointMetrics endpoint={endpoint} />
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Paper withBorder p="lg" radius="md">
          <Text size="sm" fw={500} mb="sm">Configuration</Text>
          <Stack gap="xs">
            <Group><Text size="sm" fw={500}>GPU:</Text><Text size="sm">{endpoint.gpu_spec.count}x {endpoint.gpu_spec.type}</Text></Group>
            <Group><Text size="sm" fw={500}>Replicas:</Text><Text size="sm">{endpoint.replicas}</Text></Group>
            <Group><Text size="sm" fw={500}>Status:</Text><Badge variant="dot" color={endpoint.status === 'active' ? 'green' : 'yellow'}>{endpoint.status}</Badge></Group>
            <Group><Text size="sm" fw={500}>Created:</Text><Text size="sm">{new Date(endpoint.created_at).toLocaleDateString()}</Text></Group>
          </Stack>
        </Paper>
        <AutoscalingPolicy endpoint={endpoint} />
      </SimpleGrid>
    </>
  );
}
```

- [ ] **Step 8: Verify typecheck and commit**

```bash
cd packages/console-ui && pnpm typecheck
git add packages/console-ui/src
git commit -m "feat: add Endpoints page with list, create form, metrics, autoscaling, and detail view"
```

---

## Task 4: Batch Jobs Page

**Files:**
- Create: `packages/console-ui/src/api/batchJobs.ts`
- Create: `packages/console-ui/src/hooks/useBatchJobs.ts`
- Create: `packages/console-ui/src/components/batch-jobs/BatchJobList.tsx`
- Create: `packages/console-ui/src/components/batch-jobs/CreateBatchJobForm.tsx`
- Create: `packages/console-ui/src/pages/batch-jobs/BatchJobsPage.tsx`
- Create: `packages/console-ui/src/pages/batch-jobs/CreateBatchJobPage.tsx`
- Create: `packages/console-ui/src/pages/batch-jobs/BatchJobDetailPage.tsx`

- [ ] **Step 1: Create API + hooks**

Write `packages/console-ui/src/api/batchJobs.ts`:

```typescript
import { apiFetch } from './client';
import type { PaginatedResponse, SingleResponse, BatchJob, CreateBatchJobRequest } from '@/types';

export async function getBatchJobs() { return apiFetch<PaginatedResponse<BatchJob>>('/v1/admin/batch-jobs'); }
export async function getBatchJob(id: string) { return apiFetch<SingleResponse<BatchJob>>(`/v1/admin/batch-jobs/${id}`); }
export async function createBatchJob(data: CreateBatchJobRequest) { return apiFetch<SingleResponse<BatchJob>>('/v1/admin/batch-jobs', { method: 'POST', body: JSON.stringify(data) }); }
export async function cancelBatchJob(id: string) { return apiFetch<void>(`/v1/admin/batch-jobs/${id}`, { method: 'DELETE' }); }
```

Write `packages/console-ui/src/hooks/useBatchJobs.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBatchJobs, getBatchJob, createBatchJob, cancelBatchJob } from '@/api/batchJobs';
import type { CreateBatchJobRequest } from '@/types';

export function useBatchJobs() { return useQuery({ queryKey: ['batch-jobs'], queryFn: () => getBatchJobs().then((r) => r.data) }); }
export function useBatchJob(id: string) { return useQuery({ queryKey: ['batch-jobs', id], queryFn: () => getBatchJob(id).then((r) => r.data), enabled: !!id }); }
export function useCreateBatchJob() { const qc = useQueryClient(); return useMutation({ mutationFn: (d: CreateBatchJobRequest) => createBatchJob(d).then((r) => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['batch-jobs'] }) }); }
export function useCancelBatchJob() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => cancelBatchJob(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['batch-jobs'] }) }); }
```

- [ ] **Step 2: Create BatchJobList**

Write `packages/console-ui/src/components/batch-jobs/BatchJobList.tsx`:

```typescript
import { Table, Badge, Text, Group, ActionIcon, Skeleton, Tooltip } from '@mantine/core';
import { IconEye, IconX, IconDownload } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useBatchJobs, useCancelBatchJob } from '@/hooks/useBatchJobs';
import { formatCurrency, formatTokens } from '@/utils/format';
import type { BatchJob } from '@/types';

export function BatchJobList() {
  const { data: jobs, isLoading } = useBatchJobs();
  const cancelMutation = useCancelBatchJob();
  const navigate = useNavigate();

  const statusColor: Record<string, string> = { pending: 'gray', running: 'blue', completed: 'green', failed: 'red' };

  const rows = (jobs ?? []).map((job: BatchJob) => (
    <Table.Tr key={job.id}>
      <Table.Td><Text size="sm" fw={500}>{job.name}</Text></Table.Td>
      <Table.Td><Text size="xs" c="dimmed">{job.model_id}</Text></Table.Td>
      <Table.Td><Badge variant="light" color={statusColor[job.status]} size="sm">{job.status}</Badge></Table.Td>
      <Table.Td><Text size="sm">{job.token_count ? formatTokens(job.token_count) : '-'}</Text></Table.Td>
      <Table.Td><Text size="sm">{job.cost ? formatCurrency(job.cost) : '-'}</Text></Table.Td>
      <Table.Td><Text size="xs" c="dimmed">{new Date(job.created_at).toLocaleString()}</Text></Table.Td>
      <Table.Td>
        <Group gap={4}>
          <Tooltip label="View details"><ActionIcon variant="light" size="sm" onClick={() => navigate(`/batch-jobs/${job.id}`)}><IconEye size={14} /></ActionIcon></Tooltip>
          {job.status === 'running' || job.status === 'pending' ? (
            <Tooltip label="Cancel"><ActionIcon variant="light" color="red" size="sm" onClick={() => cancelMutation.mutate(job.id)}><IconX size={14} /></ActionIcon></Tooltip>
          ) : job.output_file ? (
            <Tooltip label="Download"><ActionIcon variant="light" size="sm"><IconDownload size={14} /></ActionIcon></Tooltip>
          ) : null}
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Table striped highlightOnHover>
      <Table.Thead><Table.Tr>
        <Table.Th>Name</Table.Th><Table.Th>Model</Table.Th><Table.Th>Status</Table.Th><Table.Th>Tokens</Table.Th><Table.Th>Cost</Table.Th><Table.Th>Submitted</Table.Th><Table.Th></Table.Th>
      </Table.Tr></Table.Thead>
      <Table.Tbody>{isLoading ? [1,2,3].map((i) => <Table.Tr key={i}>{[1,2,3,4,5,6,7].map((j) => <Table.Td key={j}><Skeleton height={20} /></Table.Td>)}</Table.Tr>) : rows}</Table.Tbody>
    </Table>
  );
}
```

- [ ] **Step 3: Create CreateBatchJobForm**

Write `packages/console-ui/src/components/batch-jobs/CreateBatchJobForm.tsx`:

```typescript
import { useState, useRef } from 'react';
import { TextInput, Select, Textarea, Button, Group, Stack, FileInput, Text, Alert } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useModels } from '@/hooks/useModels';
import { useCreateBatchJob } from '@/hooks/useBatchJobs';
import { useNavigate } from 'react-router-dom';

export function CreateBatchJobForm() {
  const navigate = useNavigate();
  const createMutation = useCreateBatchJob();
  const { data: models } = useModels();
  const [name, setName] = useState('');
  const [modelId, setModelId] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [callbackUrl, setCallbackUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const modelOptions = (models ?? []).map((m) => ({ value: m.id, label: m.display_name }));

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    setFileContent(`mock://uploads/${file.name}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMutation.mutateAsync({ name, model_id: modelId, input_file: fileContent, callback_url: callbackUrl || undefined });
    navigate('/batch-jobs', { replace: true });
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack>
        <TextInput label="Job Name" placeholder="my-batch-job" required value={name} onChange={(e) => setName(e.currentTarget.value)} />
        <Select label="Model" placeholder="Select model" data={modelOptions} value={modelId} onChange={(v) => v && setModelId(v)} searchable required />
        <FileInput label="Input File (JSONL)" placeholder="Upload JSONL file" accept=".jsonl,.json" onChange={handleFileChange} required />
        {fileContent && fileContent.startsWith('mock://') && (
          <Alert icon={<IconAlertCircle size={16} />} color="blue" variant="light">
            <Text size="xs">File accepted: {fileContent.replace('mock://uploads/', '')}</Text>
          </Alert>
        )}
        <Select label="Output Format" data={[{ value: 'jsonl', label: 'JSONL' }, { value: 'json', label: 'JSON' }]} defaultValue="jsonl" />
        <TextInput label="Callback URL (optional)" placeholder="https://hooks.example.com/done" value={callbackUrl} onChange={(e) => setCallbackUrl(e.currentTarget.value)} />
        <Group justify="flex-end"><Button variant="default" onClick={() => navigate('/batch-jobs')}>Cancel</Button><Button type="submit" loading={createMutation.isPending}>Create Batch Job</Button></Group>
      </Stack>
    </form>
  );
}
```

- [ ] **Step 4: Create page components**

Write `packages/console-ui/src/pages/batch-jobs/BatchJobsPage.tsx`:

```typescript
import { Title, Button, Group, Paper } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { BatchJobList } from '@/components/batch-jobs/BatchJobList';

export function BatchJobsPage() {
  const navigate = useNavigate();
  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Batch Jobs</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/batch-jobs/new')}>Create Batch Job</Button>
      </Group>
      <Paper withBorder p="lg" radius="md"><BatchJobList /></Paper>
    </>
  );
}
```

Write `packages/console-ui/src/pages/batch-jobs/CreateBatchJobPage.tsx`:

```typescript
import { Title, Button, Group, Paper } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { CreateBatchJobForm } from '@/components/batch-jobs/CreateBatchJobForm';

export function CreateBatchJobPage() {
  const navigate = useNavigate();
  return (
    <>
      <Group mb="md"><Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/batch-jobs')}>Back to Batch Jobs</Button></Group>
      <Title order={2} mb="md">Create Batch Job</Title>
      <Paper withBorder p="lg" radius="md" maw={560}><CreateBatchJobForm /></Paper>
    </>
  );
}
```

Write `packages/console-ui/src/pages/batch-jobs/BatchJobDetailPage.tsx`:

```typescript
import { useParams, useNavigate } from 'react-router-dom';
import { Title, Paper, Text, Group, Button, Skeleton, Stack, Badge, Code } from '@mantine/core';
import { IconArrowLeft, IconDownload } from '@tabler/icons-react';
import { useBatchJob, useCancelBatchJob } from '@/hooks/useBatchJobs';
import { formatCurrency, formatTokens } from '@/utils/format';

export function BatchJobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: job, isLoading } = useBatchJob(id ?? '');
  const cancelMutation = useCancelBatchJob();

  if (isLoading) return <Skeleton height={400} />;
  if (!job) return <Text c="red">Batch job not found</Text>;

  const statusColor: Record<string, string> = { pending: 'gray', running: 'blue', completed: 'green', failed: 'red' };

  return (
    <>
      <Group mb="md"><Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/batch-jobs')}>Back</Button></Group>
      <Group justify="space-between" mb="md">
        <div>
          <Title order={2}>{job.name}</Title>
          <Group gap="xs"><Text c="dimmed" size="sm">{job.model_id}</Text><Badge variant="light" color={statusColor[job.status]}>{job.status}</Badge></Group>
        </div>
        {job.status === 'running' || job.status === 'pending' ? (
          <Button color="red" variant="light" onClick={() => cancelMutation.mutate(id!)}>Cancel Job</Button>
        ) : job.output_file ? (
          <Button leftSection={<IconDownload size={16} />}>Download Results</Button>
        ) : null}
      </Group>
      <Paper withBorder p="lg" radius="md" mb="md">
        <Text size="sm" fw={500} mb="sm">Details</Text>
        <Stack gap="xs">
          <Group><Text size="sm" fw={500}>Input File:</Text><Text size="sm">{job.input_file}</Text></Group>
          {job.output_file && <Group><Text size="sm" fw={500}>Output File:</Text><Text size="sm">{job.output_file}</Text></Group>}
          {job.callback_url && <Group><Text size="sm" fw={500}>Callback URL:</Text><Text size="sm">{job.callback_url}</Text></Group>}
          <Group><Text size="sm" fw={500}>Tokens:</Text><Text size="sm">{job.token_count ? formatTokens(job.token_count) : '-'}</Text></Group>
          <Group><Text size="sm" fw={500}>Cost:</Text><Text size="sm">{job.cost ? formatCurrency(job.cost) : 'Pending'}</Text></Group>
          <Group><Text size="sm" fw={500}>Created:</Text><Text size="sm">{new Date(job.created_at).toLocaleString()}</Text></Group>
          {job.completed_at && <Group><Text size="sm" fw={500}>Completed:</Text><Text size="sm">{new Date(job.completed_at).toLocaleString()}</Text></Group>}
        </Stack>
      </Paper>
      {job.error_log && job.error_log.length > 0 && (
        <Paper withBorder p="lg" radius="md">
          <Text size="sm" fw={500} mb="sm" c="red">Errors</Text>
          {job.error_log.map((err, i) => (
            <Group key={i} mb={4}><Badge size="xs" color="red">Line {err.line}</Badge><Code>{err.error}</Code></Group>
          ))}
        </Paper>
      )}
    </>
  );
}
```

- [ ] **Step 5: Verify typecheck and commit**

```bash
cd packages/console-ui && pnpm typecheck
git add packages/console-ui/src
git commit -m "feat: add Batch Jobs page with list, create form, detail view, and error log"
```

---

## Task 5: Billing Enhancement

**Files:**
- Modify: `packages/console-ui/src/components/billing/InvoicesTable.tsx` (add download button)
- Modify: `packages/console-ui/src/components/billing/UsageChart.tsx` (time range already done in Phase 1a)
- Create: (optional) `packages/console-ui/src/components/billing/TimeRangeSelector.tsx`

- [ ] **Step 1: Enhance InvoicesTable with download button**

Edit `packages/console-ui/src/components/billing/InvoicesTable.tsx` — add a download ActionIcon to each row:

```typescript
// Add import
import { IconDownload } from '@tabler/icons-react';

// In the Table.Th row, add <Table.Th></Table.Th> after Issued
// In each Table.Tr, add after the issued date cell:
<Table.Td>
  <ActionIcon variant="subtle" size="sm" component="a" href={inv.download_url} target="_blank">
    <IconDownload size={14} />
  </ActionIcon>
</Table.Td>
```

- [ ] **Step 2: Commit**

```bash
git add packages/console-ui/src/components/billing/InvoicesTable.tsx
git commit -m "feat: add invoice download buttons"
```

---

## Task 6: Playground — Backend Session Persistence

**Files:**
- Create: `packages/console-ui/src/api/sessions.ts`
- Create: `packages/console-ui/src/hooks/useSessions.ts`
- Modify: `packages/console-ui/src/hooks/usePlaygroundSession.ts` (hybrid localStorage + backend)
- Modify: `packages/console-ui/src/pages/playground/PlaygroundPage.tsx` (useSessionLogin)

- [ ] **Step 1: Create sessions API**

Write `packages/console-ui/src/api/sessions.ts`:

```typescript
import { apiFetch } from './client';
import type { PaginatedResponse, SingleResponse, BackendSession } from '@/types';

export async function getSessions() { return apiFetch<PaginatedResponse<BackendSession>>('/v1/admin/sessions'); }
export async function createSession(data: { name?: string; model_id?: string; messages?: { role: string; content: string }[] }) { return apiFetch<SingleResponse<BackendSession>>('/v1/admin/sessions', { method: 'POST', body: JSON.stringify(data) }); }
export async function updateSession(id: string, data: Partial<BackendSession>) { return apiFetch<SingleResponse<BackendSession>>(`/v1/admin/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }); }
export async function deleteSession(id: string) { return apiFetch<void>(`/v1/admin/sessions/${id}`, { method: 'DELETE' }); }
```

Write `packages/console-ui/src/hooks/useSessions.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSessions, createSession, updateSession, deleteSession } from '@/api/sessions';

export function useBackendSessions() { return useQuery({ queryKey: ['sessions'], queryFn: () => getSessions().then((r) => r.data) }); }
export function useCreateBackendSession() { const qc = useQueryClient(); return useMutation({ mutationFn: (d: { name?: string; model_id?: string }) => createSession(d).then((r) => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }) }); }
export function useUpdateBackendSession() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, data }: { id: string; data: Partial<{ name: string; messages: { role: string; content: string }[] }> }) => updateSession(id, data).then((r) => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }) }); }
export function useDeleteBackendSession() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => deleteSession(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }) }); }
```

- [ ] **Step 2: Modify usePlaygroundSession to sync with backend**

The hook (`usePlaygroundSession.ts`) already uses localStorage. For Phase 1b, modify it to also call the backend API when the user is logged in. The key change: on session create/update/delete, also sync to backend via the API.

This is a moderate refactor. The simplest approach for Phase 1b is to keep the existing hook's localStorage-based state as the primary store, and add background API calls to sync sessions to the backend. The `useAuth` hook's `user` presence determines whether to sync.

Add to `usePlaygroundSession.ts` (import `useAuth` and the session API functions):

```typescript
import { useAuth } from '@/stores/AuthContext';
import { createSession as apiCreateSession, updateSession as apiUpdateSession, deleteSession as apiDeleteSession } from '@/api/sessions';
```

Then modify `createSession` to also call the backend:
```typescript
if (user) {
  apiCreateSession({ name: session.name, model_id: session.modelId, messages: session.messages }).catch(() => {});
}
```

Similarly for save and delete operations.

**Merge strategy on mount (useEffect):**
```typescript
import { useEffect } from 'react';
import { useAuth } from '@/stores/AuthContext';
import { getSessions as fetchBackendSessions } from '@/api/sessions';

const { user } = useAuth();

useEffect(() => {
  if (!user) return;
  fetchBackendSessions().then((res) => {
    const backend = res.data.map((s) => ({
      id: s.id,
      name: s.name,
      modelId: s.model_id,
      messages: s.messages.map((m) => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })),
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    }));
    const localSessions = getSessions();
    // Merge: backend wins on ID conflict, keep local-only sessions
    const merged = [...backend];
    for (const ls of localSessions) {
      if (!merged.find((b) => b.id === ls.id)) merged.push(ls);
    }
    merged.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    setSessions(merged);
    saveSessions(merged);
  }).catch(() => { /* silent — fallback to localStorage */ });
}, [user]);
```

- [ ] **Step 3: Verify typecheck and commit**

```bash
cd packages/console-ui && pnpm typecheck
git add packages/console-ui/src
git commit -m "feat: add Playground backend session persistence with API sync"
```

---

## Task 7: Playground — ApiViewModal (Code Generation)

**Files:**
- Create: `packages/console-ui/src/components/playground/ApiViewModal.tsx`
- Modify: `packages/console-ui/src/pages/playground/PlaygroundPage.tsx` (add "API view" button)

- [ ] **Step 1: Create ApiViewModal**

Write `packages/console-ui/src/components/playground/ApiViewModal.tsx`:

```typescript
import { useState } from 'react';
import { Modal, SegmentedControl, Group, Code, CopyButton, ActionIcon, Text, Stack, Paper } from '@mantine/core';
import { IconCopy, IconCheck } from '@tabler/icons-react';
import type { ChatMessage } from '@/types';

interface Props {
  opened: boolean;
  onClose: () => void;
  model: string;
  messages: ChatMessage[];
  params: Record<string, unknown>;
}

function generateCurl(model: string, messages: ChatMessage[], params: Record<string, unknown>): string {
  const body = JSON.stringify({ model, messages, ...params }, null, 2);
  return `curl https://api.ultralisk.com/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $ULTRALISK_API_KEY" \\
  -d '${body}'`;
}

function generatePython(model: string, messages: ChatMessage[], params: Record<string, unknown>): string {
  const msgsStr = messages.map((m) => `    {"role": "${m.role}", "content": "${m.content}"}`).join(',\n');
  return `from openai import OpenAI

client = OpenAI(
    base_url="https://api.ultralisk.com/v1",
    api_key="your-api-key"
)

response = client.chat.completions.create(
    model="${model}",
    messages=[
${msgsStr}
    ],
    ${Object.entries(params).filter(([k]) => k !== 'stop' || (Array.isArray(params.stop) && params.stop.length > 0)).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(',\n    ')}
)
print(response.choices[0].message.content)`;
}

function generateTypeScript(model: string, messages: ChatMessage[], params: Record<string, unknown>): string {
  const msgsStr = messages.map((m) => `    { role: '${m.role}', content: '${m.content}' }`).join(',\n');
  return `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://api.ultralisk.com/v1',
  apiKey: 'your-api-key',
});

const response = await client.chat.completions.create({
  model: '${model}',
  messages: [
${msgsStr}
  ],
  ${Object.entries(params).filter(([k]) => k !== 'stop' || (Array.isArray(params.stop) && params.stop.length > 0)).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(',\n  ')}
});
console.log(response.choices[0].message.content);`;
}

const GENERATORS: Record<string, typeof generateCurl> = { curl: generateCurl, python: generatePython, typescript: generateTypeScript };

export function ApiViewModal({ opened, onClose, model, messages, params }: Props) {
  const [tab, setTab] = useState('python');
  const generator = GENERATORS[tab] ?? generatePython;
  const code = generator(model, messages.filter((m) => m.role !== 'system'), params);

  return (
    <Modal opened={opened} onClose={onClose} title="API Request Preview" size="xl" centered>
      <Group justify="flex-end" mb="sm">
        <SegmentedControl size="xs" value={tab}
          data={[
            { label: 'Python', value: 'python' },
            { label: 'TypeScript', value: 'typescript' },
            { label: 'curl', value: 'curl' },
          ]}
          onChange={setTab as (v: string) => void}
        />
      </Group>
      <Paper withBorder p="sm" bg="var(--mantine-color-dark-8)" style={{ position: 'relative' }}>
        <CopyButton value={code} timeout={2000}>
          {({ copied, copy }) => (
            <ActionIcon color={copied ? 'teal' : 'gray'} variant="subtle" onClick={copy}
              style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}>
              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            </ActionIcon>
          )}
        </CopyButton>
        <Code block style={{ background: 'transparent', whiteSpace: 'pre-wrap' }}>{code}</Code>
      </Paper>
    </Modal>
  );
}
```

- [ ] **Step 2: Add "API view" button to PlaygroundPage**

Edit `packages/console-ui/src/pages/playground/PlaygroundPage.tsx`:

Add import:
```typescript
import { ApiViewModal } from '@/components/playground/ApiViewModal';
import { ActionIcon, Tooltip } from '@mantine/core'; // add if not present
import { IconCode } from '@tabler/icons-react';
```

Add state:
```typescript
const [apiViewOpen, setApiViewOpen] = useState(false);
```

Add button next to the model selector (or in the top bar Group):
```typescript
<Tooltip label="View API code">
  <ActionIcon variant="light" onClick={() => setApiViewOpen(true)} disabled={!activeSession?.messages.length}>
    <IconCode size={18} />
  </ActionIcon>
</Tooltip>
```

Add modal at bottom of the return (before the closing `</div>`):
```typescript
<ApiViewModal
  opened={apiViewOpen}
  onClose={() => setApiViewOpen(false)}
  model={activeSession?.modelId ?? ''}
  messages={activeSession?.messages ?? []}
  params={params}
/>
```

- [ ] **Step 3: Commit**

```bash
git add packages/console-ui/src
git commit -m "feat: add API View modal with curl/Python/TS code generation"
```

---

## Task 8: Playground — Message Editing & Regeneration

**Files:**
- Modify: `packages/console-ui/src/pages/playground/PlaygroundPage.tsx`
- Modify: `packages/console-ui/src/components/playground/ChatArea.tsx`

- [ ] **Step 1: Implement message editing**

Add state to `PlaygroundPage.tsx`:
```typescript
const [editingIndex, setEditingIndex] = useState<number | null>(null);
const [editingContent, setEditingContent] = useState('');
```

Add handlers:
```typescript
const handleEditMessage = (index: number) => {
  setEditingIndex(index);
  setEditingContent(activeSession?.messages[index]?.content ?? '');
};

const handleSaveEdit = () => {
  if (editingIndex === null || !activeId || !activeSession) return;
  const msgs = activeSession.messages.map((m, i) =>
    i === editingIndex ? { ...m, content: editingContent } : m
  );
  // Reset session messages by re-adding the edited message
  addMessage(activeId, msgs[editingIndex]);
  setEditingIndex(null);
};

const handleCancelEdit = () => setEditingIndex(null);
```

In `ChatArea`, when `editingIndex` matches a message index, render a `Textarea` with save/cancel:
```typescript
{editingIndex === i ? (
  <Paper withBorder p="md" radius="md" mb="sm" key={i}>
    <Textarea value={editingContent} onChange={(e) => setEditingContent(e.currentTarget.value)}
      minRows={3} autosize mb="xs" />
    <Group justify="flex-end" gap="xs">
      <Button size="xs" variant="default" onClick={handleCancelEdit}>Cancel</Button>
      <Button size="xs" onClick={handleSaveEdit}>Save</Button>
    </Group>
  </Paper>
) : (
  <MessageBubble key={i} ... />
)}
```

- [ ] **Step 2: Implement regeneration**

Add handler in `PlaygroundPage.tsx`:
```typescript
const handleRegenerate = () => {
  if (!activeId || !activeSession) return;
  const msgs = activeSession.messages;
  if (msgs.length < 2) return;
  const lastUserIdx = [...msgs].reverse().findIndex((m) => m.role === 'user');
  if (lastUserIdx === -1) return;
  const truncateAt = msgs.length - 1 - lastUserIdx;
  const truncated = msgs.slice(0, truncateAt + 1);
  setStreamingContent('');
  send(activeSession.modelId, truncated, params,
    (token) => setStreamingContent((prev) => prev + token),
    () => { setStreamingContent((prev) => { if (prev && activeId) updateLastAssistant(activeId, prev); return ''; }); },
    () => {},
  );
};
```

- [ ] **Step 3: Commit**

```bash
git add packages/console-ui/src
git commit -m "feat: add Playground message editing and regeneration"
```

---

## Task 9: Playground — Multi-Modal Image Upload

**Files:**
- Modify: `packages/console-ui/src/components/playground/ChatInput.tsx` (add image preview)
- Modify: `packages/console-ui/src/pages/playground/PlaygroundPage.tsx` (handle image in messages)

- [ ] **Step 1: Enhance ChatInput with image upload**

Edit `ChatInput.tsx` to handle file selection:

```typescript
const [images, setImages] = useState<{ file: File; preview: string }[]>([]);
const fileInputRef = useRef<HTMLInputElement>(null);

const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = Array.from(e.target.files ?? []);
  const valid = files.filter((f) => f.type.startsWith('image/'));
  valid.forEach((f) => {
    const reader = new FileReader();
    reader.onload = () => setImages((prev) => [...prev, { file: f, preview: reader.result as string }]);
    reader.readAsDataURL(f);
  });
};
```

Add image preview thumbnails above the input box. Modify handleSend to include images as ContentPart[].

- [ ] **Step 2: Commit**

```bash
git add packages/console-ui/src
git commit -m "feat: add Playground multi-modal image upload with preview"
```

---

## Task 10: Phase 1a Deferred Items

**Files:**
- Modify: `packages/console-ui/src/components/models/ModelsTable.tsx` (add reserve columns)
- Modify: `packages/console-ui/src/components/api-keys/CreateKeyModal.tsx` (add PATCH support if time)

- [ ] **Step 1: Models table — add placeholder columns**

Add after the "Status" column:
```typescript
<Table.Th>Avg Latency<Text size="xs" c="dimmed" fw={400}>Phase 2</Text></Table.Th>
<Table.Th>GPU Util<Text size="xs" c="dimmed" fw={400}>Phase 2</Text></Table.Th>
```

And in each row, add placeholder cells:
```typescript
<Table.Td><Text size="xs" c="dimmed">—</Text></Table.Td>
<Table.Td><Text size="xs" c="dimmed">—</Text></Table.Td>
```

- [ ] **Step 2: Commit**

```bash
git add packages/console-ui/src
git commit -m "chore: add Phase 2 placeholder columns to Models table"
```

---

## Summary

Total tasks: 10

### Pages delivered in Phase 1b:

| Page | Route | New/Modified |
|------|-------|-------------|
| Endpoints | `/endpoints` | NEW |
| Create Endpoint | `/endpoints/new` | NEW |
| Endpoint Detail | `/endpoints/:id` | NEW |
| Batch Jobs | `/batch-jobs` | NEW |
| Create Batch Job | `/batch-jobs/new` | NEW |
| Batch Job Detail | `/batch-jobs/:id` | NEW |
| Billing (enhanced) | `/billing` | MODIFIED |
| Playground (enhanced) | `/playground` | MODIFIED |

### Key competitive positioning:
- **Endpoints**: Catches up to Together AI's Reserved/Dedicated tiers (still missing GPU Clusters — Phase 2)
- **Batch Jobs**: New capability that Together AI has (50% discount, JSONL) — now matched
- **Playground persistence**: Moves from localStorage to backend, enabling cross-device sync — still ahead of Together AI
- **API view + editing + multi-modal**: Closes the remaining Playground gaps vs Together AI's feature set
