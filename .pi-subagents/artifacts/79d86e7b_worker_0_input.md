# Task for worker

You are implementing Phase 2a Task 2: Types, Sidebar, Routes

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

Task 1 (stub API) is done. Extend the frontend with Phase 2a types, sidebar, and routes.

## Step 1: Add Phase 2a types

Read `packages/console-ui/src/types/index.ts` first. Append these AFTER the existing types:

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
```

## Step 2: Update Sidebar

Read `packages/console-ui/src/components/Sidebar.tsx`.

Add these to the icon imports:
```typescript
import { IconServer, IconCpu, IconRocket } from '@tabler/icons-react';
```

Add a new section after the "Inference" section closing `]},` and before the "Organization" section:
```typescript
{ section: 'Operations', items: [
  { label: 'Clusters', icon: IconServer, path: '/clusters' },
  { label: 'Nodes', icon: IconCpu, path: '/nodes' },
  { label: 'Deployments', icon: IconRocket, path: '/deployments' },
]},
```

## Step 3: Add routes to App.tsx

Read `packages/console-ui/src/App.tsx`.

Add these imports:
```typescript
import { ClustersPage } from '@/pages/clusters/ClustersPage';
import { ClusterDetailPage } from '@/pages/clusters/ClusterDetailPage';
import { NodesPage } from '@/pages/nodes/NodesPage';
import { NodeDetailPage } from '@/pages/nodes/NodeDetailPage';
import { DeploymentsPage } from '@/pages/deployments/DeploymentsPage';
import { DeploymentDetailPage } from '@/pages/deployments/DeploymentDetailPage';
```

But these pages don't exist yet — create placeholder files so App.tsx typechecks:

Create these files with `export function XxxPage() { return null; }`:
- packages/console-ui/src/pages/clusters/ClustersPage.tsx
- packages/console-ui/src/pages/clusters/ClusterDetailPage.tsx
- packages/console-ui/src/pages/nodes/NodesPage.tsx
- packages/console-ui/src/pages/nodes/NodeDetailPage.tsx
- packages/console-ui/src/pages/deployments/DeploymentsPage.tsx
- packages/console-ui/src/pages/deployments/DeploymentDetailPage.tsx

Add these routes INSIDE the ConsoleLayout Route (after the settings/profile route):
```typescript
<Route path="/clusters" element={<ClustersPage />} />
<Route path="/clusters/:id" element={<ClusterDetailPage />} />
<Route path="/clusters/:clusterId/nodes/:nodeId" element={<NodeDetailPage />} />
<Route path="/nodes" element={<NodesPage />} />
<Route path="/nodes/:id" element={<NodeDetailPage />} />
<Route path="/deployments" element={<DeploymentsPage />} />
<Route path="/deployments/:id" element={<DeploymentDetailPage />} />
```

## Step 4: Verify typecheck and commit

```bash
cd packages/console-ui && pnpm typecheck
git add packages/console-ui/src
git commit -m "feat: add Phase 2a types, Operations sidebar, and routes"
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