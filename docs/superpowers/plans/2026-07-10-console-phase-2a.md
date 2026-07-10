# Ultralisk Console Phase 2a — Operations: Clusters, Nodes, Deployments

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Operations infrastructure for Phase 2 — add Operations sidebar section, Clusters (list/detail), Nodes (list/detail with per-GPU-card metrics), and Deployments (list/detail with scale/rollback).

**Architecture:** Same monorepo. New pages under Operations sidebar section. Data models: Cluster → Nodes[] → GpuCards[]. Stub backend gets mock cluster/node/gpu/deployment data with Metric time-series.

**Tech Stack:** Same — React 19.2, TypeScript, Mantine v9, @mantine/charts (CompositeChart for time-series), @tanstack/react-query v5, React Router v7, Vite 6

**Reference specs:**
- Design: `docs/superpowers/specs/2026-07-10-ultralisk-console-design.md` (§5.2 sidebar, §5.4 Phase 2 routes, §7.1 Clusters, §7.2 Nodes, §7.3 Deployments, §9 data models)
- Competitive analysis: `docs/superpowers/specs/2026-07-10-console-competitive-analysis.md` (§2.7 GPU Utilization context)

---

## File Structure (new/modified files)

```
packages/console-ui/src/
├── types/index.ts                       # MODIFY: add Cluster, Node, GpuCard, Deployment, Metric types
├── App.tsx                              # MODIFY: add Phase 2 routes
├── components/Sidebar.tsx               # MODIFY: add Operations section
├── pages/
│   ├── clusters/
│   │   ├── ClustersPage.tsx             # CREATE
│   │   └── ClusterDetailPage.tsx        # CREATE
│   ├── nodes/
│   │   └── NodeDetailPage.tsx           # CREATE
│   └── deployments/
│       ├── DeploymentsPage.tsx          # CREATE
│       └── DeploymentDetailPage.tsx     # CREATE
├── components/
│   ├── clusters/
│   │   └── ClusterList.tsx              # CREATE
│   ├── nodes/
│   │   ├── NodeList.tsx                 # CREATE
│   │   └── GpuCardGrid.tsx              # CREATE (per-GPU-card metrics grid)
│   └── deployments/
│       └── DeploymentList.tsx           # CREATE
├── api/
│   ├── clusters.ts                      # CREATE
│   ├── nodes.ts                         # CREATE
│   └── deployments.ts                   # CREATE
├── hooks/
│   ├── useClusters.ts                   # CREATE
│   ├── useNodes.ts                      # CREATE
│   └── useDeployments.ts               # CREATE

packages/console-api/src/
├── fixtures.ts                          # MODIFY: add Cluster, Node, GpuCard, Deployment, Metric fixtures
└── index.ts                             # MODIFY: add Phase 2 API endpoints
```

---

## Task 1: Stub API — Clusters, Nodes, Deployments

**Files:**
- Modify: `packages/console-api/src/fixtures.ts`
- Modify: `packages/console-api/src/index.ts`

- [ ] **Step 1: Append mock fixtures**

Append to `packages/console-api/src/fixtures.ts`:

```typescript
export const MOCK_CLUSTERS = [
  { id: 'cl_001', name: 'us-east-1-prod', region: 'us-east-1', gpu_type: 'H100', node_count: 8, healthy_nodes: 8, status: 'healthy', avg_gpu_util: 67 },
  { id: 'cl_002', name: 'us-west-2-prod', region: 'us-west-2', gpu_type: 'H100', node_count: 4, healthy_nodes: 3, status: 'degraded', avg_gpu_util: 82 },
  { id: 'cl_003', name: 'eu-central-1-dev', region: 'eu-central-1', gpu_type: 'A100', node_count: 2, healthy_nodes: 2, status: 'healthy', avg_gpu_util: 34 },
];

const NOW = Date.now();

function ts(minAgo: number): string { return new Date(NOW - minAgo * 60000).toISOString(); }

export const MOCK_NODES: Record<string, any[]> = {
  cl_001: [
    { id: 'node_001', cluster_id: 'cl_001', hostname: 'gpu-n01', gpu_model: 'H100', gpu_count: 8, driver_version: '560.35.03', cuda_version: '12.6', status: 'online' },
    { id: 'node_002', cluster_id: 'cl_001', hostname: 'gpu-n02', gpu_model: 'H100', gpu_count: 8, driver_version: '560.35.03', cuda_version: '12.6', status: 'online' },
    { id: 'node_003', cluster_id: 'cl_001', hostname: 'gpu-n03', gpu_model: 'H100', gpu_count: 8, driver_version: '560.35.03', cuda_version: '12.6', status: 'online' },
    { id: 'node_004', cluster_id: 'cl_001', hostname: 'gpu-n04', gpu_model: 'H100', gpu_count: 8, driver_version: '560.35.03', cuda_version: '12.6', status: 'online' },
    { id: 'node_005', cluster_id: 'cl_001', hostname: 'gpu-n05', gpu_model: 'H100', gpu_count: 8, driver_version: '560.35.03', cuda_version: '12.6', status: 'online' },
    { id: 'node_006', cluster_id: 'cl_001', hostname: 'gpu-n06', gpu_model: 'H100', gpu_count: 8, driver_version: '560.35.03', cuda_version: '12.6', status: 'degraded' },
    { id: 'node_007', cluster_id: 'cl_001', hostname: 'gpu-n07', gpu_model: 'H100', gpu_count: 8, driver_version: '560.35.03', cuda_version: '12.6', status: 'online' },
    { id: 'node_008', cluster_id: 'cl_001', hostname: 'gpu-n08', gpu_model: 'H100', gpu_count: 8, driver_version: '560.35.03', cuda_version: '12.6', status: 'offline' },
  ],
  cl_002: [
    { id: 'node_009', cluster_id: 'cl_002', hostname: 'gpu-w01', gpu_model: 'H100', gpu_count: 8, driver_version: '560.35.03', cuda_version: '12.6', status: 'online' },
    { id: 'node_010', cluster_id: 'cl_002', hostname: 'gpu-w02', gpu_model: 'H100', gpu_count: 8, driver_version: '560.35.03', cuda_version: '12.6', status: 'online' },
    { id: 'node_011', cluster_id: 'cl_002', hostname: 'gpu-w03', gpu_model: 'H100', gpu_count: 8, driver_version: '560.35.03', cuda_version: '12.6', status: 'degraded' },
    { id: 'node_012', cluster_id: 'cl_002', hostname: 'gpu-w04', gpu_model: 'H100', gpu_count: 8, driver_version: '560.35.03', cuda_version: '12.6', status: 'online' },
  ],
  cl_003: [
    { id: 'node_013', cluster_id: 'cl_003', hostname: 'gpu-e01', gpu_model: 'A100', gpu_count: 4, driver_version: '550.54.15', cuda_version: '12.4', status: 'online' },
    { id: 'node_014', cluster_id: 'cl_003', hostname: 'gpu-e02', gpu_model: 'A100', gpu_count: 4, driver_version: '550.54.15', cuda_version: '12.4', status: 'online' },
  ],
};

function generateGpuCards(nodeId: string, count: number): any[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${nodeId}-gpu${i}`, node_id: nodeId, index: i,
    utilization_percent: Math.floor(Math.random() * 30 + 50),
    memory_used: Math.floor(Math.random() * 20 + 60), memory_total: 80,
    temperature: Math.floor(Math.random() * 15 + 60),
    processes: i % 2 === 0 ? [{ pid: 12345 + i, name: 'vllm', memory_mb: 10240 + i * 512 }] : [],
    metrics: Array.from({ length: 30 }, (_, j) => ({
      metric_name: 'gpu_util', timestamp: ts(j * 2), value: Math.floor(Math.random() * 40 + 40),
    })),
  }));
}

export const MOCK_GPU_CARDS: Record<string, any[]> = {};
for (const [clusterId, nodes] of Object.entries(MOCK_NODES)) {
  for (const node of nodes) {
    MOCK_GPU_CARDS[node.id] = generateGpuCards(node.id, node.gpu_count);
  }
}

export const MOCK_DEPLOYMENTS = [
  { id: 'dep_001', name: 'llama-3.3-70b', model_id: 'llama-3.3-70b-instruct', endpoint_id: 'ep_001', cluster_id: 'cl_001', replicas: 2, gpu_per_replica: 1, status: 'active', created_at: ts(1440) },
  { id: 'dep_002', name: 'deepseek-v4-pro', model_id: 'deepseek-v4-pro', endpoint_id: 'ep_002', cluster_id: 'cl_001', replicas: 1, gpu_per_replica: 1, status: 'active', created_at: ts(720) },
  { id: 'dep_003', name: 'qwen-2.5-72b', model_id: 'qwen-2.5-72b', endpoint_id: null, cluster_id: 'cl_002', replicas: 1, gpu_per_replica: 2, status: 'degraded', created_at: ts(360) },
  { id: 'dep_004', name: 'llama-3.1-8b', model_id: 'llama-3.1-8b-instruct', endpoint_id: null, cluster_id: 'cl_003', replicas: 2, gpu_per_replica: 1, status: 'active', created_at: ts(180) },
];

export const MOCK_DEPLOYMENT_VERSIONS: Record<string, any[]> = {
  dep_001: [
    { version: 3, deployed_at: ts(120), status: 'active', image: 'vllm:v0.8.3-llama33' },
    { version: 2, deployed_at: ts(600), status: 'rolled_back', image: 'vllm:v0.8.2' },
    { version: 1, deployed_at: ts(1440), status: 'rolled_back', image: 'vllm:v0.8.1' },
  ],
  dep_002: [
    { version: 2, deployed_at: ts(360), status: 'active', image: 'vllm:v0.8.3-deepseek' },
    { version: 1, deployed_at: ts(720), status: 'rolled_back', image: 'vllm:v0.8.2' },
  ],
  dep_003: [
    { version: 1, deployed_at: ts(360), status: 'active', image: 'vllm:v0.8.2-qwen' },
  ],
  dep_004: [
    { version: 2, deployed_at: ts(60), status: 'active', image: 'vllm:v0.8.3-llama8b' },
    { version: 1, deployed_at: ts(180), status: 'rolled_back', image: 'vllm:v0.7.1' },
  ],
};
```

Also update the default export to include `MOCK_NODES` and `MOCK_GPU_CARDS` and `MOCK_DEPLOYMENTS` and `MOCK_DEPLOYMENT_VERSIONS`.

Add these imports (if not already) and export lines at the bottom of index.ts — actually, they're already exported by default since they're `export const`.

- [ ] **Step 2: Add API endpoint handlers**

Add to `packages/console-api/src/index.ts` (imports first, then handlers before `// === Chat completions`):

Update imports:
```typescript
import {
  MOCK_USER, MOCK_JWT, MOCK_MODELS, MODEL_DETAILS, MOCK_USAGE, MOCK_BILLING,
  MOCK_API_KEYS, MOCK_ENDPOINTS, MOCK_BATCH_JOBS, MOCK_SESSIONS,
  MOCK_CLUSTERS, MOCK_NODES, MOCK_GPU_CARDS, MOCK_DEPLOYMENTS, MOCK_DEPLOYMENT_VERSIONS,
} from './fixtures.js';
```

Add handlers:

```typescript
// === Clusters (Phase 2) ===
app.get('/v1/admin/clusters', (_req, res) => {
  res.json({ data: MOCK_CLUSTERS, pagination: { page: 1, limit: 20, total: MOCK_CLUSTERS.length } });
});

app.get('/v1/admin/clusters/:id', (req, res) => {
  const cluster = MOCK_CLUSTERS.find((c) => c.id === req.params.id);
  if (!cluster) return res.status(404).json({ error: { code: 'not_found', message: 'Cluster not found' } });
  const nodes = MOCK_NODES[cluster.id] ?? [];
  const totalGpu = nodes.reduce((s: number, n: any) => s + n.gpu_count, 0);
  const utilizations = nodes.flatMap((n: any) => MOCK_GPU_CARDS[n.id] ?? []).map((g: any) => g.utilization_percent);
  const avgUtil = utilizations.length > 0 ? (utilizations.reduce((a: number, b: number) => a + b, 0) / utilizations.length) : 0;
  res.json({ data: { ...cluster, nodes, total_gpu: totalGpu, avg_gpu_util: Math.round(avgUtil) } });
});

// === Nodes (Phase 2) ===
app.get('/v1/admin/nodes', (_req, res) => {
  const allNodes = Object.values(MOCK_NODES).flat();
  res.json({ data: allNodes, pagination: { page: 1, limit: 50, total: allNodes.length } });
});

app.get('/v1/admin/nodes/:id', (req, res) => {
  const allNodes = Object.values(MOCK_NODES).flat();
  const node = allNodes.find((n: any) => n.id === req.params.id);
  if (!node) return res.status(404).json({ error: { code: 'not_found', message: 'Node not found' } });
  const gpuCards = MOCK_GPU_CARDS[node.id] ?? [];
  res.json({ data: { ...node, gpu_cards: gpuCards } });
});

app.get('/v1/admin/clusters/:clusterId/nodes/:nodeId', (req, res) => {
  const allNodes = Object.values(MOCK_NODES).flat();
  const node = allNodes.find((n: any) => n.id === req.params.nodeId && n.cluster_id === req.params.clusterId);
  if (!node) return res.status(404).json({ error: { code: 'not_found', message: 'Node not found' } });
  const gpuCards = MOCK_GPU_CARDS[node.id] ?? [];
  res.json({ data: { ...node, gpu_cards: gpuCards } });
});

// === Deployments (Phase 2) ===
app.get('/v1/admin/deployments', (_req, res) => {
  res.json({ data: MOCK_DEPLOYMENTS, pagination: { page: 1, limit: 20, total: MOCK_DEPLOYMENTS.length } });
});

app.get('/v1/admin/deployments/:id', (req, res) => {
  const dep = MOCK_DEPLOYMENTS.find((d) => d.id === req.params.id);
  if (!dep) return res.status(404).json({ error: { code: 'not_found', message: 'Deployment not found' } });
  const versions = MOCK_DEPLOYMENT_VERSIONS[dep.id] ?? [];
  res.json({ data: { ...dep, versions } });
});

app.post('/v1/admin/deployments/:id/scale', (req, res) => {
  const dep = MOCK_DEPLOYMENTS.find((d) => d.id === req.params.id);
  if (!dep) return res.status(404).json({ error: { code: 'not_found', message: 'Deployment not found' } });
  dep.replicas = req.body.replicas ?? dep.replicas;
  res.json({ data: dep });
});

app.post('/v1/admin/deployments/:id/rollback', (req, res) => {
  const dep = MOCK_DEPLOYMENTS.find((d) => d.id === req.params.id);
  if (!dep) return res.status(404).json({ error: { code: 'not_found', message: 'Deployment not found' } });
  res.json({ data: { ...dep, status: 'rolling_back' } });
});
```

- [ ] **Step 3: Verify**

```bash
cd packages/console-api && pnpm dev &
sleep 2
curl -s http://localhost:3100/v1/admin/clusters | python3 -c "import sys,json; d=json.load(sys.stdin); print('Clusters:', len(d['data']))"
curl -s http://localhost:3100/v1/admin/clusters/cl_001 | python3 -c "import sys,json; d=json.load(sys.stdin); print('Cluster detail:', d['data']['name'], '- nodes:', len(d['data']['nodes']))"
curl -s http://localhost:3100/v1/admin/nodes | python3 -c "import sys,json; d=json.load(sys.stdin); print('Nodes:', len(d['data']))"
curl -s http://localhost:3100/v1/admin/nodes/node_001 | python3 -c "import sys,json; d=json.load(sys.stdin); print('Node detail:', d['data']['hostname'], '- GPUs:', len(d['data']['gpu_cards']))"
curl -s http://localhost:3100/v1/admin/deployments | python3 -c "import sys,json; d=json.load(sys.stdin); print('Deployments:', len(d['data']))"
kill %1 2>/dev/null
```

- [ ] **Step 4: Commit**

```bash
git add packages/console-api/src
git commit -m "feat(api): add Phase 2 stub endpoints — Clusters, Nodes, Deployments"
```

---

## Task 2: Types, Sidebar, Routes

**Files:**
- Modify: `packages/console-ui/src/types/index.ts`
- Modify: `packages/console-ui/src/components/Sidebar.tsx`
- Modify: `packages/console-ui/src/App.tsx`

- [ ] **Step 1: Add Phase 2 types**

Append to `packages/console-ui/src/types/index.ts`:

```typescript
// === Cluster (Phase 2) ===
export interface Cluster {
  id: string; name: string; region: string; gpu_type: string;
  node_count: number; healthy_nodes: number; status: 'healthy' | 'degraded';
  avg_gpu_util: number;
}

export interface ClusterDetail extends Cluster {
  nodes: Node[];
  total_gpu: number;
  avg_gpu_util: number;
  recent_alerts?: { severity: string; message: string; time: string }[];
}

// === Node (Phase 2) ===
export interface Node {
  id: string; cluster_id: string; hostname: string; gpu_model: string;
  gpu_count: number; driver_version: string; cuda_version: string;
  status: 'online' | 'degraded' | 'offline';
}

export interface NodeDetail extends Node {
  gpu_cards: GpuCard[];
}

// === GpuCard (Phase 2) ===
export interface GpuCard {
  id: string; node_id: string; index: number;
  utilization_percent: number; memory_used: number; memory_total: number;
  temperature: number;
  processes: { pid: number; name: string; memory_mb: number }[];
  metrics: { metric_name: string; timestamp: string; value: number }[];
}

// === Deployment (Phase 2) ===
export interface Deployment {
  id: string; name: string; model_id: string; endpoint_id: string | null;
  cluster_id: string; replicas: number; gpu_per_replica: number;
  status: 'active' | 'degraded' | 'rolling_back'; created_at: string;
}

export interface DeploymentDetail extends Deployment {
  versions: DeploymentVersion[];
}

export interface DeploymentVersion {
  version: number; deployed_at: string; status: string; image: string;
}

// === Metric (Phase 2) ===
export interface TimeSeriesMetric {
  metric_name: string; timestamp: string; value: number; labels?: Record<string, string>;
}
```

- [ ] **Step 2: Update Sidebar**

Edit `packages/console-ui/src/components/Sidebar.tsx` — add imports:
```typescript
import { IconServer, IconCpu, IconRocket } from '@tabler/icons-react';
```

Add a new section after "Inference" and before "Organization":
```typescript
{ section: 'Operations', items: [
  { label: 'Clusters', icon: IconServer, path: '/clusters' },
  { label: 'Nodes', icon: IconCpu, path: '/nodes' },
  { label: 'Deployments', icon: IconRocket, path: '/deployments' },
]},
```

- [ ] **Step 3: Add routes to App.tsx**

Add imports (create placeholder pages if needed):
```typescript
import { ClustersPage } from '@/pages/clusters/ClustersPage';
import { ClusterDetailPage } from '@/pages/clusters/ClusterDetailPage';
import { NodeDetailPage } from '@/pages/nodes/NodeDetailPage';
import { DeploymentsPage } from '@/pages/deployments/DeploymentsPage';
import { DeploymentDetailPage } from '@/pages/deployments/DeploymentDetailPage';
```

Create placeholder files for all 5 pages (each exports a component that returns null).

Add routes inside ConsoleLayout:
```typescript
<Route path="/clusters" element={<ClustersPage />} />
<Route path="/clusters/:id" element={<ClusterDetailPage />} />
<Route path="/clusters/:clusterId/nodes/:nodeId" element={<NodeDetailPage />} />
<Route path="/nodes" element={<NodesPage />} />
<Route path="/nodes/:id" element={<NodeDetailPage />} />
<Route path="/deployments" element={<DeploymentsPage />} />
<Route path="/deployments/:id" element={<DeploymentDetailPage />} />
```

Also create `NodesPage.tsx` placeholder.

- [ ] **Step 4: Verify typecheck and commit**

```bash
cd packages/console-ui && pnpm typecheck
git add packages/console-ui/src
git commit -m "feat: add Phase 2 types, Operations sidebar, and routes"
```

---

## Task 3: Clusters Page

**Files:**
- Create: `packages/console-ui/src/api/clusters.ts`
- Create: `packages/console-ui/src/hooks/useClusters.ts`
- Create: `packages/console-ui/src/components/clusters/ClusterList.tsx`
- Create: `packages/console-ui/src/pages/clusters/ClustersPage.tsx`
- Create: `packages/console-ui/src/pages/clusters/ClusterDetailPage.tsx`

- [ ] **Step 1: Create API + hooks**

`packages/console-ui/src/api/clusters.ts`:
```typescript
import { apiFetch } from './client';
import type { PaginatedResponse, SingleResponse, Cluster, ClusterDetail } from '@/types';

export async function getClusters() { return apiFetch<PaginatedResponse<Cluster>>('/v1/admin/clusters'); }
export async function getCluster(id: string) { return apiFetch<SingleResponse<ClusterDetail>>(`/v1/admin/clusters/${id}`); }
```

`packages/console-ui/src/hooks/useClusters.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { getClusters, getCluster } from '@/api/clusters';

export function useClusters() { return useQuery({ queryKey: ['clusters'], queryFn: () => getClusters().then((r) => r.data) }); }
export function useCluster(id: string) { return useQuery({ queryKey: ['clusters', id], queryFn: () => getCluster(id).then((r) => r.data), enabled: !!id }); }
```

- [ ] **Step 2: Create ClusterList**

`packages/console-ui/src/components/clusters/ClusterList.tsx`:
```typescript
import { Table, Badge, Text, Group, ActionIcon, Skeleton, Tooltip, Progress } from '@mantine/core';
import { IconEye } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useClusters } from '@/hooks/useClusters';
import type { Cluster } from '@/types';

export function ClusterList() {
  const { data: clusters, isLoading } = useClusters();
  const navigate = useNavigate();

  const rows = (clusters ?? []).map((c: Cluster) => (
    <Table.Tr key={c.id}>
      <Table.Td><Text size="sm" fw={500}>{c.name}</Text><Text size="xs" c="dimmed">{c.region}</Text></Table.Td>
      <Table.Td><Badge variant="light" size="sm">{c.gpu_type}</Badge></Table.Td>
      <Table.Td><Text size="sm">{c.healthy_nodes}/{c.node_count}</Text></Table.Td>
      <Table.Td>
        <Group gap="xs">
          <Progress value={c.avg_gpu_util} size="sm" w={80} color={c.avg_gpu_util > 80 ? 'red' : c.avg_gpu_util > 60 ? 'yellow' : 'green'} />
          <Text size="xs">{c.avg_gpu_util}%</Text>
        </Group>
      </Table.Td>
      <Table.Td><Badge variant="dot" size="sm" color={c.status === 'healthy' ? 'green' : 'yellow'}>{c.status}</Badge></Table.Td>
      <Table.Td><Tooltip label="View cluster"><ActionIcon variant="light" size="sm" onClick={() => navigate(`/clusters/${c.id}`)}><IconEye size={14} /></ActionIcon></Tooltip></Table.Td>
    </Table.Tr>
  ));

  return (
    <Table striped highlightOnHover>
      <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>GPU</Table.Th><Table.Th>Nodes</Table.Th><Table.Th>Avg GPU Util</Table.Th><Table.Th>Status</Table.Th><Table.Th></Table.Th></Table.Tr></Table.Thead>
      <Table.Tbody>{isLoading ? [1,2,3].map((i) => <Table.Tr key={i}>{[1,2,3,4,5,6].map((j) => <Table.Td key={j}><Skeleton height={20} /></Table.Td>)}</Table.Tr>) : rows}</Table.Tbody>
    </Table>
  );
}
```

- [ ] **Step 3: Create ClustersPage**

`packages/console-ui/src/pages/clusters/ClustersPage.tsx`:
```typescript
import { Title, Paper, SimpleGrid, Text, Group, ThemeIcon } from '@mantine/core';
import { IconServer, IconCpu, IconAlertTriangle, IconActivity } from '@tabler/icons-react';
import { ClusterList } from '@/components/clusters/ClusterList';
import { useClusters } from '@/hooks/useClusters';

export function ClustersPage() {
  const { data: clusters } = useClusters();
  const totalGpu = (clusters ?? []).reduce((s, c) => s + c.node_count * (c.gpu_type === 'H100' ? 8 : 4), 0);
  const avgUtil = clusters?.length ? Math.round(clusters.reduce((s, c) => s + c.avg_gpu_util, 0) / clusters.length) : 0;
  const degraded = (clusters ?? []).filter((c) => c.status === 'degraded').length;

  const cards = [
    { label: 'Total Clusters', value: clusters?.length ?? '-', icon: IconServer, color: 'blue' },
    { label: 'Total GPUs', value: totalGpu.toLocaleString(), icon: IconCpu, color: 'violet' },
    { label: 'Avg Utilization', value: `${avgUtil}%`, icon: IconActivity, color: avgUtil > 80 ? 'red' : 'green' },
    { label: 'Degraded', value: degraded, icon: IconAlertTriangle, color: degraded > 0 ? 'yellow' : 'green' },
  ];

  return (
    <>
      <Title order={2} mb="md">Clusters</Title>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="md">
        {cards.map((card) => (
          <Paper key={card.label} withBorder p="md" radius="md">
            <Group><ThemeIcon variant="light" color={card.color} size="lg"><card.icon size={20} /></ThemeIcon>
              <div><Text size="xs" c="dimmed" tt="uppercase" fw={700}>{card.label}</Text><Text fw={700} size="lg">{card.value}</Text></div>
            </Group>
          </Paper>
        ))}
      </SimpleGrid>
      <Paper withBorder p="lg" radius="md"><ClusterList /></Paper>
    </>
  );
}
```

- [ ] **Step 4: Create ClusterDetailPage**

`packages/console-ui/src/pages/clusters/ClusterDetailPage.tsx`:
```typescript
import { useParams, useNavigate } from 'react-router-dom';
import { Title, Paper, Text, Group, Button, Skeleton, Stack, Badge, SimpleGrid, Progress, Table } from '@mantine/core';
import { IconArrowLeft, IconCpu } from '@tabler/icons-react';
import { useCluster } from '@/hooks/useClusters';
import { formatRelativeTime } from '@/utils/format';

export function ClusterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: cluster, isLoading } = useCluster(id ?? '');
  if (isLoading) return <Skeleton height={400} />;
  if (!cluster) return <Text c="red">Cluster not found</Text>;

  return (
    <>
      <Group mb="md"><Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/clusters')}>Back</Button></Group>
      <Group mb="md">
        <div><Title order={2}>{cluster.name}</Title><Group gap="xs"><Text c="dimmed" size="sm">{cluster.region}</Text><Badge variant="light" size="sm">{cluster.gpu_type}</Badge></Group></div>
        <Badge variant="dot" size="lg" color={cluster.status === 'healthy' ? 'green' : 'yellow'} ml="auto">{cluster.status}</Badge>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="md">
        <Paper withBorder p="md" radius="md"><Text size="xs" c="dimmed" tt="uppercase">Nodes</Text><Text fw={700} size="lg">{cluster.healthy_nodes}/{cluster.node_count}</Text></Paper>
        <Paper withBorder p="md" radius="md"><Text size="xs" c="dimmed" tt="uppercase">Total GPUs</Text><Text fw={700} size="lg">{cluster.total_gpu}</Text></Paper>
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" tt="uppercase">Avg GPU Util</Text>
          <Group gap="xs"><Progress value={cluster.avg_gpu_util} size="lg" w={80} color={cluster.avg_gpu_util > 80 ? 'red' : cluster.avg_gpu_util > 60 ? 'yellow' : 'green'} /><Text fw={700} size="lg">{cluster.avg_gpu_util}%</Text></Group>
        </Paper>
        <Paper withBorder p="md" radius="md"><Text size="xs" c="dimmed" tt="uppercase">GPU Type</Text><Text fw={700} size="lg">{cluster.gpu_type}</Text></Paper>
      </SimpleGrid>

      <Title order={4} mb="sm">Nodes</Title>
      <Paper withBorder p="lg" radius="md">
        <Table striped highlightOnHover>
          <Table.Thead><Table.Tr><Table.Th>Hostname</Table.Th><Table.Th>GPU Model</Table.Th><Table.Th>GPUs</Table.Th><Table.Th>Driver</Table.Th><Table.Th>CUDA</Table.Th><Table.Th>Status</Table.Th><Table.Th></Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>{(cluster.nodes ?? []).map((node: any) => (
            <Table.Tr key={node.id}>
              <Table.Td><Text size="sm" fw={500}>{node.hostname}</Text></Table.Td>
              <Table.Td><Badge variant="light" size="sm">{node.gpu_model}</Badge></Table.Td>
              <Table.Td><Text size="sm">{node.gpu_count}</Text></Table.Td>
              <Table.Td><Text size="xs" c="dimmed">{node.driver_version}</Text></Table.Td>
              <Table.Td><Text size="xs" c="dimmed">{node.cuda_version}</Text></Table.Td>
              <Table.Td><Badge variant="dot" size="sm" color={node.status === 'online' ? 'green' : node.status === 'degraded' ? 'yellow' : 'red'}>{node.status}</Badge></Table.Td>
              <Table.Td><Button size="xs" variant="light" leftSection={<IconCpu size={12} />} onClick={() => navigate(`/clusters/${cluster.id}/nodes/${node.id}`)}>GPUs</Button></Table.Td>
            </Table.Tr>
          ))}</Table.Tbody>
        </Table>
      </Paper>
    </>
  );
}
```

- [ ] **Step 5: Commit**

```bash
cd packages/console-ui && pnpm typecheck
git add packages/console-ui/src
git commit -m "feat: add Clusters page with list, summary cards, and detail view with node table"
```

---

## Task 4: Nodes Page

**Files:**
- Create: `packages/console-ui/src/api/nodes.ts`
- Create: `packages/console-ui/src/hooks/useNodes.ts`
- Create: `packages/console-ui/src/components/nodes/NodeList.tsx`
- Create: `packages/console-ui/src/components/nodes/GpuCardGrid.tsx`
- Create: `packages/console-ui/src/pages/nodes/NodesPage.tsx`
- Create: `packages/console-ui/src/pages/nodes/NodeDetailPage.tsx`

- [ ] **Step 1: Create API + hooks**

`packages/console-ui/src/api/nodes.ts`:
```typescript
import { apiFetch } from './client';
import type { PaginatedResponse, SingleResponse, Node, NodeDetail } from '@/types';

export async function getNodes() { return apiFetch<PaginatedResponse<Node>>('/v1/admin/nodes'); }
export async function getNode(id: string) { return apiFetch<SingleResponse<NodeDetail>>(`/v1/admin/nodes/${id}`); }
export async function getClusterNode(clusterId: string, nodeId: string) { return apiFetch<SingleResponse<NodeDetail>>(`/v1/admin/clusters/${clusterId}/nodes/${nodeId}`); }
```

`packages/console-ui/src/hooks/useNodes.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { getNodes, getNode, getClusterNode } from '@/api/nodes';

export function useNodes() { return useQuery({ queryKey: ['nodes'], queryFn: () => getNodes().then((r) => r.data) }); }
export function useNode(id: string) { return useQuery({ queryKey: ['nodes', id], queryFn: () => getNode(id).then((r) => r.data), enabled: !!id }); }
export function useClusterNode(clusterId: string, nodeId: string) { return useQuery({ queryKey: ['nodes', clusterId, nodeId], queryFn: () => getClusterNode(clusterId, nodeId).then((r) => r.data), enabled: !!clusterId && !!nodeId }); }
```

- [ ] **Step 2: Create NodeList**

`packages/console-ui/src/components/nodes/NodeList.tsx`:
```typescript
import { Table, Badge, Text, Group, ActionIcon, Skeleton, Tooltip } from '@mantine/core';
import { IconEye } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useNodes } from '@/hooks/useNodes';
import type { Node } from '@/types';

export function NodeList() {
  const { data: nodes, isLoading } = useNodes();
  const navigate = useNavigate();

  const rows = (nodes ?? []).map((n: Node) => (
    <Table.Tr key={n.id}>
      <Table.Td><Text size="sm" fw={500}>{n.hostname}</Text><Text size="xs" c="dimmed">{n.id}</Text></Table.Td>
      <Table.Td><Badge variant="light" size="sm">{n.gpu_model}</Badge></Table.Td>
      <Table.Td><Text size="sm">{n.gpu_count}</Text></Table.Td>
      <Table.Td><Text size="xs" c="dimmed">{n.driver_version}</Text></Table.Td>
      <Table.Td><Text size="xs" c="dimmed">{n.cuda_version}</Text></Table.Td>
      <Table.Td><Badge variant="dot" size="sm" color={n.status === 'online' ? 'green' : n.status === 'degraded' ? 'yellow' : 'red'}>{n.status}</Badge></Table.Td>
      <Table.Td><Tooltip label="View GPUs"><ActionIcon variant="light" size="sm" onClick={() => navigate(`/nodes/${n.id}`)}><IconEye size={14} /></ActionIcon></Tooltip></Table.Td>
    </Table.Tr>
  ));

  return (
    <Table striped highlightOnHover>
      <Table.Thead><Table.Tr><Table.Th>Hostname</Table.Th><Table.Th>GPU</Table.Th><Table.Th>Count</Table.Th><Table.Th>Driver</Table.Th><Table.Th>CUDA</Table.Th><Table.Th>Status</Table.Th><Table.Th></Table.Th></Table.Tr></Table.Thead>
      <Table.Tbody>{isLoading ? [1,2,3].map((i) => <Table.Tr key={i}>{[1,2,3,4,5,6,7].map((j) => <Table.Td key={j}><Skeleton height={20} /></Table.Td>)}</Table.Tr>) : rows}</Table.Tbody>
    </Table>
  );
}
```

- [ ] **Step 3: Create GpuCardGrid**

`packages/console-ui/src/components/nodes/GpuCardGrid.tsx`:
```typescript
import { SimpleGrid, Paper, Text, Group, Progress, Badge, Tooltip } from '@mantine/core';
import type { GpuCard } from '@/types';

export function GpuCardGrid({ cards }: { cards: GpuCard[] }) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="md">
      {cards.map((gpu) => {
        const memPct = Math.round((gpu.memory_used / gpu.memory_total) * 100);
        const utilColor = gpu.utilization_percent > 80 ? 'red' : gpu.utilization_percent > 50 ? 'yellow' : 'green';
        const tempColor = gpu.temperature > 80 ? 'red' : gpu.temperature > 70 ? 'yellow' : 'green';

        return (
          <Paper key={gpu.id} withBorder p="md" radius="md">
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={600}>GPU {gpu.index}</Text>
              <Badge size="xs" color={gpu.processes.length > 0 ? 'green' : 'gray'} variant="light">{gpu.processes.length} processes</Badge>
            </Group>
            <Group mb={4}><Text size="xs" c="dimmed">Utilization</Text><Text size="xs" fw={500}>{gpu.utilization_percent}%</Text></Group>
            <Progress value={gpu.utilization_percent} size="sm" color={utilColor} mb="xs" />
            <Group mb={4}><Text size="xs" c="dimmed">Memory</Text><Text size="xs" fw={500}>{gpu.memory_used}/{gpu.memory_total} GB</Text></Group>
            <Progress value={memPct} size="sm" color={memPct > 80 ? 'red' : 'blue'} mb="xs" />
            <Group><Text size="xs" c="dimmed">Temp</Text><Text size="xs" fw={500} c={tempColor}>{gpu.temperature}°C</Text></Group>
            {gpu.processes.length > 0 && (
              <Paper bg="var(--mantine-color-dark-8)" p="xs" mt="xs" style={{ borderRadius: 4 }}>
                <Text size="xs" c="dimmed">Processes:</Text>
                {gpu.processes.map((p) => (
                  <Text key={p.pid} size="xs" ff="mono">{p.name} ({p.memory_mb}MB)</Text>
                ))}
              </Paper>
            )}
          </Paper>
        );
      })}
    </SimpleGrid>
  );
}
```

- [ ] **Step 4: Create NodesPage**

`packages/console-ui/src/pages/nodes/NodesPage.tsx`:
```typescript
import { Title, Paper } from '@mantine/core';
import { NodeList } from '@/components/nodes/NodeList';

export function NodesPage() {
  return (
    <>
      <Title order={2} mb="md">Nodes</Title>
      <Paper withBorder p="lg" radius="md"><NodeList /></Paper>
    </>
  );
}
```

- [ ] **Step 5: Create NodeDetailPage**

`packages/console-ui/src/pages/nodes/NodeDetailPage.tsx`:
```typescript
import { useParams, useNavigate } from 'react-router-dom';
import { Title, Paper, Text, Group, Button, Skeleton, Stack, Badge, SimpleGrid } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useNode, useClusterNode } from '@/hooks/useNodes';
import { GpuCardGrid } from '@/components/nodes/GpuCardGrid';
import { AreaChart } from '@mantine/charts';

export function NodeDetailPage() {
  const { nodeId, clusterId } = useParams<{ nodeId: string; clusterId?: string }>();
  const navigate = useNavigate();
  const { data: node, isLoading } = clusterId ? useClusterNode(clusterId, nodeId!) : useNode(nodeId!);

  if (isLoading) return <Skeleton height={400} />;
  if (!node) return <Text c="red">Node not found</Text>;

  const avgUtil = node.gpu_cards?.length ? Math.round(node.gpu_cards.reduce((s, g) => s + g.utilization_percent, 0) / node.gpu_cards.length) : 0;
  const avgTemp = node.gpu_cards?.length ? Math.round(node.gpu_cards.reduce((s, g) => s + g.temperature, 0) / node.gpu_cards.length) : 0;

  // Build time-series chart data from first GPU card metrics
  const firstGpu = node.gpu_cards?.[0];
  const chartData = firstGpu?.metrics?.slice(0, 20)?.map((m) => ({ time: new Date(m.timestamp).toLocaleTimeString(), Utilization: m.value })) ?? [];

  return (
    <>
      <Group mb="md"><Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => clusterId ? navigate(`/clusters/${clusterId}`) : navigate('/nodes')}>Back</Button></Group>
      <Group mb="md">
        <div><Title order={2}>{node.hostname}</Title><Group gap="xs"><Text c="dimmed" size="sm">{node.gpu_model} · {node.gpu_count} GPUs</Text><Badge variant="dot" size="sm" color={node.status === 'online' ? 'green' : 'red'}>{node.status}</Badge></Group></div>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }} mb="md">
        <Paper withBorder p="md" radius="md"><Text size="xs" c="dimmed" tt="uppercase">Avg GPU Util</Text><Text fw={700} size="xl">{avgUtil}%</Text></Paper>
        <Paper withBorder p="md" radius="md"><Text size="xs" c="dimmed" tt="uppercase">Avg Temperature</Text><Text fw={700} size="xl">{avgTemp}°C</Text></Paper>
        <Paper withBorder p="md" radius="md"><Text size="xs" c="dimmed" tt="uppercase">Driver / CUDA</Text><Text fw={500} size="sm">{node.driver_version} / {node.cuda_version}</Text></Paper>
      </SimpleGrid>

      {chartData.length > 0 && (
        <Paper withBorder p="lg" radius="md" mb="md">
          <Text size="sm" fw={500} mb="sm">GPU Utilization (last 40 min)</Text>
          <AreaChart h={200} data={chartData} dataKey="time" series={[{ name: 'Utilization', color: 'violet.6' }]} curveType="natural" tickLine="none" gridAxis="y" withYAxis={false} />
        </Paper>
      )}

      <Title order={4} mb="sm">GPU Cards ({node.gpu_cards?.length ?? 0})</Title>
      <GpuCardGrid cards={node.gpu_cards ?? []} />
    </>
  );
}
```

- [ ] **Step 6: Commit**

```bash
cd packages/console-ui && pnpm typecheck
git add packages/console-ui/src
git commit -m "feat: add Nodes page with list, detail view, GPU card grid, and time-series chart"
```

---

## Task 5: Deployments Page

**Files:**
- Create: `packages/console-ui/src/api/deployments.ts`
- Create: `packages/console-ui/src/hooks/useDeployments.ts`
- Create: `packages/console-ui/src/components/deployments/DeploymentList.tsx`
- Create: `packages/console-ui/src/components/deployments/ScaleControls.tsx`
- Create: `packages/console-ui/src/components/deployments/RollbackControls.tsx`
- Create: `packages/console-ui/src/pages/deployments/DeploymentsPage.tsx`
- Create: `packages/console-ui/src/pages/deployments/DeploymentDetailPage.tsx`

- [ ] **Step 1: Create API + hooks**

`packages/console-ui/src/api/deployments.ts`:
```typescript
import { apiFetch } from './client';
import type { PaginatedResponse, SingleResponse, Deployment, DeploymentDetail } from '@/types';

export async function getDeployments() { return apiFetch<PaginatedResponse<Deployment>>('/v1/admin/deployments'); }
export async function getDeployment(id: string) { return apiFetch<SingleResponse<DeploymentDetail>>(`/v1/admin/deployments/${id}`); }
export async function scaleDeployment(id: string, replicas: number) { return apiFetch<SingleResponse<Deployment>>(`/v1/admin/deployments/${id}/scale`, { method: 'POST', body: JSON.stringify({ replicas }) }); }
export async function rollbackDeployment(id: string) { return apiFetch<SingleResponse<Deployment>>(`/v1/admin/deployments/${id}/rollback`, { method: 'POST' }); }
```

`packages/console-ui/src/hooks/useDeployments.ts`:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDeployments, getDeployment, scaleDeployment, rollbackDeployment } from '@/api/deployments';

export function useDeployments() { return useQuery({ queryKey: ['deployments'], queryFn: () => getDeployments().then((r) => r.data) }); }
export function useDeployment(id: string) { return useQuery({ queryKey: ['deployments', id], queryFn: () => getDeployment(id).then((r) => r.data), enabled: !!id }); }
export function useScaleDeployment() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, replicas }: { id: string; replicas: number }) => scaleDeployment(id, replicas), onSuccess: () => qc.invalidateQueries({ queryKey: ['deployments'] }) }); }
export function useRollbackDeployment() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => rollbackDeployment(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['deployments'] }) }); }
```

- [ ] **Step 2: Create DeploymentList**

`packages/console-ui/src/components/deployments/DeploymentList.tsx`:
```typescript
import { Table, Badge, Text, Group, ActionIcon, Skeleton, Tooltip } from '@mantine/core';
import { IconEye, IconArrowsMaximize } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useDeployments } from '@/hooks/useDeployments';
import type { Deployment } from '@/types';

export function DeploymentList() {
  const { data: deployments, isLoading } = useDeployments();
  const navigate = useNavigate();

  const rows = (deployments ?? []).map((d: Deployment) => (
    <Table.Tr key={d.id}>
      <Table.Td><Text size="sm" fw={500}>{d.name}</Text><Text size="xs" c="dimmed">{d.model_id}</Text></Table.Td>
      <Table.Td><Text size="sm">{d.replicas}</Text></Table.Td>
      <Table.Td><Text size="sm">{d.gpu_per_replica} GPU</Text></Table.Td>
      <Table.Td><Badge variant="light" size="sm">{d.cluster_id}</Badge></Table.Td>
      <Table.Td><Badge variant="dot" size="sm" color={d.status === 'active' ? 'green' : d.status === 'degraded' ? 'yellow' : 'blue'}>{d.status}</Badge></Table.Td>
      <Table.Td>
        <Group gap={4}>
          <Tooltip label="View details"><ActionIcon variant="light" size="sm" onClick={() => navigate(`/deployments/${d.id}`)}><IconEye size={14} /></ActionIcon></Tooltip>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Table striped highlightOnHover>
      <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Replicas</Table.Th><Table.Th>GPU/Replica</Table.Th><Table.Th>Cluster</Table.Th><Table.Th>Status</Table.Th><Table.Th></Table.Th></Table.Tr></Table.Thead>
      <Table.Tbody>{isLoading ? [1,2,3].map((i) => <Table.Tr key={i}>{[1,2,3,4,5,6].map((j) => <Table.Td key={j}><Skeleton height={20} /></Table.Td>)}</Table.Tr>) : rows}</Table.Tbody>
    </Table>
  );
}
```

- [ ] **Step 3: Create DeploymentsPage**

`packages/console-ui/src/pages/deployments/DeploymentsPage.tsx`:
```typescript
import { Title, Paper } from '@mantine/core';
import { DeploymentList } from '@/components/deployments/DeploymentList';

export function DeploymentsPage() {
  return (
    <>
      <Title order={2} mb="md">Deployments</Title>
      <Paper withBorder p="lg" radius="md"><DeploymentList /></Paper>
    </>
  );
}
```

- [ ] **Step 4: Create DeploymentDetailPage**

`packages/console-ui/src/pages/deployments/DeploymentDetailPage.tsx`:
```typescript
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Title, Paper, Text, Group, Button, Skeleton, Stack, Badge, Table, NumberInput, SimpleGrid, Tooltip } from '@mantine/core';
import { IconArrowLeft, IconRefresh } from '@tabler/icons-react';
import { useDeployment, useScaleDeployment, useRollbackDeployment } from '@/hooks/useDeployments';
import { formatRelativeTime } from '@/utils/format';

export function DeploymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: dep, isLoading } = useDeployment(id ?? '');
  const scaleMutation = useScaleDeployment();
  const rollbackMutation = useRollbackDeployment();
  const [replicas, setReplicas] = useState(dep?.replicas ?? 1);

  if (isLoading) return <Skeleton height={400} />;
  if (!dep) return <Text c="red">Deployment not found</Text>;

  // Sync replicas state when dep loads
  useEffect(() => {
    if (dep?.replicas !== undefined && dep.replicas !== replicas) {
      setReplicas(dep.replicas);
    }
  }, [dep?.replicas]);

  return (
    <>
      <Group mb="md"><Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/deployments')}>Back</Button></Group>
      <Group justify="space-between" mb="md">
        <div><Title order={2}>{dep.name}</Title><Group gap="xs"><Text c="dimmed" size="sm">{dep.model_id}</Text><Badge variant="light" size="sm">{dep.cluster_id}</Badge></Group></div>
        <Badge variant="dot" size="lg" color={dep.status === 'active' ? 'green' : dep.status === 'degraded' ? 'yellow' : 'blue'}>{dep.status}</Badge>
      </Group>

      <SimpleGrid cols={{ base: 1, md: 2 }} mb="md">
        <Paper withBorder p="lg" radius="md">
          <Text size="sm" fw={500} mb="sm">Scale</Text>
          <Group>
            <NumberInput value={replicas} onChange={(v) => setReplicas(typeof v === 'number' ? v : 1)} min={0} max={20} w={100} />
            <Button size="sm" onClick={() => scaleMutation.mutate({ id: dep.id, replicas })} loading={scaleMutation.isPending} disabled={replicas === dep.replicas}>Scale</Button>
          </Group>
          <Text size="xs" c="dimmed" mt={4}>Current: {dep.replicas} replicas · {dep.gpu_per_replica} GPU each</Text>
        </Paper>

        <Paper withBorder p="lg" radius="md">
          <Text size="sm" fw={500} mb="sm">Rollback</Text>
          <Button variant="light" color="orange" leftSection={<IconRefresh size={16} />} onClick={() => rollbackMutation.mutate(dep.id)} loading={rollbackMutation.isPending}>Rollback to Previous Version</Button>
          <Text size="xs" c="dimmed" mt={4}>Rolls back to the last active version</Text>
        </Paper>
      </SimpleGrid>

      {dep.versions && dep.versions.length > 0 && (
        <Paper withBorder p="lg" radius="md">
          <Text size="sm" fw={500} mb="sm">Version History</Text>
          <Table striped highlightOnHover>
            <Table.Thead><Table.Tr><Table.Th>Version</Table.Th><Table.Th>Image</Table.Th><Table.Th>Deployed</Table.Th><Table.Th>Status</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{dep.versions.map((v: any) => (
              <Table.Tr key={v.version}>
                <Table.Td><Text fw={500}>v{v.version}</Text></Table.Td>
                <Table.Td><Text size="xs" ff="mono">{v.image}</Text></Table.Td>
                <Table.Td><Text size="sm">{formatRelativeTime(v.deployed_at)}</Text></Table.Td>
                <Table.Td><Badge variant="light" size="sm" color={v.status === 'active' ? 'green' : 'gray'}>{v.status}</Badge></Table.Td>
              </Table.Tr>
            ))}</Table.Tbody>
          </Table>
        </Paper>
      )}
    </>
  );
}
```

- [ ] **Step 5: Commit**

```bash
cd packages/console-ui && pnpm typecheck
git add packages/console-ui/src
git commit -m "feat: add Deployments page with list, detail, scale controls, and rollback"
```

---

## Summary

**Phase 2a delivers:**

| Page | Route | Features |
|------|-------|----------|
| Clusters | `/clusters` | Summary cards (total GPUs, avg util, degraded), list with progress bars |
| Cluster Detail | `/clusters/:id` | Node table, per-node GPU link, overview metrics |
| Nodes | `/nodes` | Global node list with driver/CUDA versions |
| Node Detail | `/nodes/:id` + `/clusters/:clusterId/nodes/:nodeId` | Per-GPU-card grid (util, mem, temp, processes), time-series chart |
| Deployments | `/deployments` | Deployment list with replicas and status |
| Deployment Detail | `/deployments/:id` | Scale controls, rollback button, version history table |
| Sidebar | — | New Operations section with Clusters, Nodes, Deployments |

**Deferred to later Phase 2 sub-plans:**
- GPU Utilization dashboard (2b)
- Cost Analytics (2c)
- Incidents + AI-Assisted Diagnostics (2d)
- Organization/Settings pages, enhanced RBAC (2e)
- Model Shaping / Fine-tuning (2+)
