# Task for worker

You are implementing Phase 2a Task 1: Stub API — Clusters, Nodes, Deployments

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

Phase 1a and 1b are complete. The API stub at `packages/console-api/src/index.ts` and `fixtures.ts` already exist. EXTEND them with Phase 2a endpoints.

## Step 1: Append mock fixtures

Read `packages/console-api/src/fixtures.ts` first. Append these exports at the END of the file:

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

## Step 2: Add API handlers to index.ts

Read `packages/console-api/src/index.ts`. 

First, update the import line to add the new fixtures:
```typescript
import {
  MOCK_USER, MOCK_JWT, MOCK_MODELS, MODEL_DETAILS, MOCK_USAGE, MOCK_BILLING,
  MOCK_API_KEYS, MOCK_ENDPOINTS, MOCK_BATCH_JOBS, MOCK_SESSIONS,
  MOCK_CLUSTERS, MOCK_NODES, MOCK_GPU_CARDS, MOCK_DEPLOYMENTS, MOCK_DEPLOYMENT_VERSIONS,
} from './fixtures.js';
```

Second, add these handlers BEFORE `// === Chat completions (SSE stub) ===`:

```typescript
// === Clusters (Phase 2) ===
app.get('/v1/admin/clusters', (_req, res) => {
  res.json({ data: MOCK_CLUSTERS, pagination: { page: 1, limit: 20, total: MOCK_CLUSTERS.length } });
});

app.get('/v1/admin/clusters/:id', (req, res) => {
  const cluster = MOCK_CLUSTERS.find((c: any) => c.id === req.params.id);
  if (!cluster) return res.status(404).json({ error: { code: 'not_found', message: 'Cluster not found' } });
  const nodes = MOCK_NODES[cluster.id] ?? [];
  const totalGpu = nodes.reduce((s: number, n: any) => s + n.gpu_count, 0);
  const utilizations = nodes.flatMap((n: any) => MOCK_GPU_CARDS[n.id] ?? []).map((g: any) => g.utilization_percent);
  const avgUtil = utilizations.length > 0 ? Math.round(utilizations.reduce((a: number, b: number) => a + b, 0) / utilizations.length) : 0;
  res.json({ data: { ...cluster, nodes, total_gpu: totalGpu, avg_gpu_util: avgUtil } });
});

// === Nodes (Phase 2) ===
app.get('/v1/admin/nodes', (_req, res) => {
  const allNodes = Object.values(MOCK_NODES).flat();
  res.json({ data: allNodes, pagination: { page: 1, limit: 50, total: allNodes.length } });
});

app.get('/v1/admin/nodes/:id', (req, res) => {
  const allNodes = Object.values(MOCK_NODES).flat();
  const node = (allNodes as any[]).find((n: any) => n.id === req.params.id);
  if (!node) return res.status(404).json({ error: { code: 'not_found', message: 'Node not found' } });
  const gpuCards = MOCK_GPU_CARDS[node.id] ?? [];
  res.json({ data: { ...node, gpu_cards: gpuCards } });
});

app.get('/v1/admin/clusters/:clusterId/nodes/:nodeId', (req, res) => {
  const allNodes = Object.values(MOCK_NODES).flat();
  const node = (allNodes as any[]).find((n: any) => n.id === req.params.nodeId && n.cluster_id === req.params.clusterId);
  if (!node) return res.status(404).json({ error: { code: 'not_found', message: 'Node not found' } });
  const gpuCards = MOCK_GPU_CARDS[node.id] ?? [];
  res.json({ data: { ...node, gpu_cards: gpuCards } });
});

// === Deployments (Phase 2) ===
app.get('/v1/admin/deployments', (_req, res) => {
  res.json({ data: MOCK_DEPLOYMENTS, pagination: { page: 1, limit: 20, total: MOCK_DEPLOYMENTS.length } });
});

app.get('/v1/admin/deployments/:id', (req, res) => {
  const dep = MOCK_DEPLOYMENTS.find((d: any) => d.id === req.params.id);
  if (!dep) return res.status(404).json({ error: { code: 'not_found', message: 'Deployment not found' } });
  const versions = MOCK_DEPLOYMENT_VERSIONS[dep.id] ?? [];
  res.json({ data: { ...dep, versions } });
});

app.post('/v1/admin/deployments/:id/scale', (req, res) => {
  const dep = MOCK_DEPLOYMENTS.find((d: any) => d.id === req.params.id);
  if (!dep) return res.status(404).json({ error: { code: 'not_found', message: 'Deployment not found' } });
  dep.replicas = req.body.replicas ?? dep.replicas;
  res.json({ data: dep });
});

app.post('/v1/admin/deployments/:id/rollback', (_req, res) => {
  const dep = MOCK_DEPLOYMENTS.find((d: any) => d.id === _req.params.id);
  if (!dep) return res.status(404).json({ error: { code: 'not_found', message: 'Deployment not found' } });
  res.json({ data: { ...dep, status: 'rolling_back' } });
});
```

## Step 3: Verify

```bash
cd packages/console-api && pnpm dev &
sleep 2
echo "=== Clusters ===" && curl -s http://localhost:3100/v1/admin/clusters | python3 -c "import sys,json; d=json.load(sys.stdin); print('List:', len(d['data']), 'clusters')"
echo "=== Cluster Detail ===" && curl -s http://localhost:3100/v1/admin/clusters/cl_001 | python3 -c "import sys,json; d=json.load(sys.stdin); print('Detail:', d['data']['name'], '- nodes:', len(d['data']['nodes']))"
echo "=== Nodes ===" && curl -s http://localhost:3100/v1/admin/nodes | python3 -c "import sys,json; d=json.load(sys.stdin); print('List:', len(d['data']), 'nodes')"
echo "=== Node Detail ===" && curl -s http://localhost:3100/v1/admin/nodes/node_001 | python3 -c "import sys,json; d=json.load(sys.stdin); print('Detail:', d['data']['hostname'], '- GPUs:', len(d['data']['gpu_cards']))"
echo "=== Deployments ===" && curl -s http://localhost:3100/v1/admin/deployments | python3 -c "import sys,json; d=json.load(sys.stdin); print('List:', len(d['data']), 'deployments')"
kill %1 2>/dev/null
```

## Step 4: Commit

```bash
git add packages/console-api/src
git commit -m "feat(api): add Phase 2a stub endpoints — Clusters, Nodes, Deployments"
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