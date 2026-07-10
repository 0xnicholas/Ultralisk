# Task for worker

Implement Phase 2d Tasks 1+2: Stub API + Types/Routes/Sidebar

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

Phase 2a-c done. Build the foundation for Incidents.

## TASK 1: Stub API

### Step 1.1: Append to fixtures.ts

Read `packages/console-api/src/fixtures.ts`. Append at the end:

```typescript
// === Incidents / AI Diagnostics (Phase 2d) ===
function ts(minAgo: number): string { return new Date(Date.now() - minAgo * 60000).toISOString(); }

export const MOCK_INCIDENTS = [
  {
    id: 'inc_001', severity: 'critical', status: 'open', title: 'GPU Utilization Drop — gpu-n12',
    description: 'GPU utilization dropped from 72% to 18% in 10 minutes',
    detection_type: 'gpu_drop',
    affected_entities: { cluster_id: 'cl_001', node_id: 'node_006', model_id: null, endpoint_id: 'ep_001' },
    ai_analysis: {
      model_used: 'llama-3.3-70b-instruct', completed_at: ts(5),
      root_causes: [
        { cause: 'OOM Kill (vLLM worker crashed)', confidence: 0.92, evidence: 'vllm-worker-3 exited with code 137 (SIGKILL) at 14:32:05. GPU memory peaked at 79.2/80 GB at 14:31:58.' },
        { cause: 'GPU driver crash', confidence: 0.45, evidence: 'nvidia-smi reported "Unknown Error" at 14:32:10 — may be a side effect of OOM.' },
        { cause: 'Thermal throttling', confidence: 0.12, evidence: 'GPU 2 temperature reached 87°C at 14:28 — but only 1 of 8 cards affected.' },
      ],
      recommendations: [
        { action: 'Restart vllm-worker-3', risk: 'low', description: 'Node has no production traffic. Safe to restart immediately.' },
        { action: 'Reduce --max-model-len from 8192 to 4096', risk: 'low', description: 'Long-term fix to reduce memory pressure.' },
      ],
    },
    conversation_history: [
      { timestamp: ts(4), role: 'user', content: 'What was the GPU memory trend before the crash?' },
      { timestamp: ts(4), role: 'assistant', content: 'GPU memory on node gpu-n12 showed a monotonic increase from 62GB to 79GB over the 30 minutes before the crash, indicating a memory leak in the vLLM worker processing long-context requests.' },
    ],
    action_log: [
      { timestamp: ts(10), user_id: 'system', action: 'Incident auto-created from Prometheus alert', result: '' },
      { timestamp: ts(6), user_id: 'system', action: 'AI analysis completed', result: '3 root causes identified' },
    ],
    triggered_at: ts(10), mitigated_at: null, resolved_at: null, suppressed_at: null,
  },
  {
    id: 'inc_002', severity: 'critical', status: 'investigating', title: 'Latency Spike — deepseek-reserved',
    description: 'TTFT p95 exceeded baseline 3x for 5 minutes',
    detection_type: 'latency_spike',
    affected_entities: { cluster_id: 'cl_001', node_id: 'node_002', model_id: 'deepseek-v4-pro', endpoint_id: 'ep_002' },
    ai_analysis: {
      model_used: 'llama-3.3-70b-instruct', completed_at: ts(30),
      root_causes: [
        { cause: 'Request queue backlog', confidence: 0.78, evidence: 'Queue depth spiked from 12 to 147 in 2 minutes at 13:15. Concurrent requests exceeded max model parallelism.' },
        { cause: 'Model warm-up after scale-up', confidence: 0.55, evidence: 'A new replica was added at 13:10 — model loading caused temporary throughput degradation.' },
      ],
      recommendations: [
        { action: 'Scale up replicas from 2 to 3', risk: 'medium', description: 'Increases cost but provides immediate relief for queue backlog.' },
        { action: 'Enable pre-warming for new replicas', risk: 'low', description: 'Pre-loads model weights before adding to LB pool.' },
      ],
    },
    conversation_history: [],
    action_log: [
      { timestamp: ts(35), user_id: 'system', action: 'Incident auto-created from Prometheus alert', result: '' },
      { timestamp: ts(32), user_id: 'alice@ultralisk.com', action: 'Status changed to investigating', result: '' },
    ],
    triggered_at: ts(35), mitigated_at: null, resolved_at: null, suppressed_at: null,
  },
  {
    id: 'inc_003', severity: 'warning', status: 'mitigated', title: 'High GPU Temperature — gpu-w03',
    description: 'GPU temperature >85°C for 10 minutes on node gpu-w03',
    detection_type: 'thermal_throttle',
    affected_entities: { cluster_id: 'cl_002', node_id: 'node_011', model_id: null, endpoint_id: null },
    ai_analysis: {
      model_used: 'llama-3.3-70b-instruct', completed_at: ts(120),
      root_causes: [
        { cause: 'Cooling system degradation', confidence: 0.83, evidence: 'Fan speed reported at 65% despite sustained 87°C temperature. Adjacent GPU 3 shows normal temp at 72°C, ruling out ambient temp issue.' },
      ],
      recommendations: [
        { action: 'Drain node from load balancer', risk: 'low', description: 'Immediate action to prevent thermal damage.' },
        { action: 'Schedule cooling maintenance', risk: 'low', description: 'Check fans and heatsink seating on affected node.' },
      ],
    },
    conversation_history: [],
    action_log: [
      { timestamp: ts(180), user_id: 'system', action: 'Incident auto-created', result: '' },
      { timestamp: ts(150), user_id: 'system', action: 'Tier 1 auto-remediation: drained from LB', result: 'Node removed from LB pool' },
      { timestamp: ts(120), user_id: 'operator@ultralisk.com', action: 'Status changed to mitigated', result: 'Temperature dropped to 72°C after drain' },
    ],
    triggered_at: ts(180), mitigated_at: ts(110), resolved_at: null, suppressed_at: null,
  },
  {
    id: 'inc_004', severity: 'critical', status: 'resolved', title: 'Node Offline — gpu-n08',
    description: 'Node gpu-n08 heartbeat lost for >60s',
    detection_type: 'node_offline',
    affected_entities: { cluster_id: 'cl_001', node_id: 'node_008', model_id: null, endpoint_id: null },
    ai_analysis: {
      model_used: 'llama-3.3-70b-instruct', completed_at: ts(300),
      root_causes: [
        { cause: 'NIC failure', confidence: 0.91, evidence: 'Node powered on but unreachable via management network. BMC logs show NIC link down at time of incident.' },
      ],
      recommendations: [
        { action: 'Replace NIC on gpu-n08', risk: 'medium', description: 'Requires node drain and maintenance window.' },
      ],
    },
    conversation_history: [],
    action_log: [
      { timestamp: ts(360), user_id: 'system', action: 'Incident auto-created', result: '' },
      { timestamp: ts(300), user_id: 'ops@ultralisk.com', action: 'NIC replacement completed', result: 'Node back online. Metrics recovered within 10 min.' },
      { timestamp: ts(290), user_id: 'system', action: 'Incident auto-resolved', result: 'Metrics recovered for >10 minutes' },
    ],
    triggered_at: ts(360), mitigated_at: ts(300), resolved_at: ts(290), suppressed_at: null,
  },
  {
    id: 'inc_005', severity: 'warning', status: 'suppressed', title: 'Memory Leak Trend — gpu-n06',
    description: 'GPU memory usage monotonically increased >20% over 24h',
    detection_type: 'memory_leak',
    affected_entities: { cluster_id: 'cl_001', node_id: 'node_006', model_id: 'llama-3.3-70b-instruct', endpoint_id: null },
    ai_analysis: {
      model_used: 'llama-3.3-70b-instruct', completed_at: ts(1440),
      root_causes: [
        { cause: 'vLLM memory fragmentation', confidence: 0.67, evidence: 'KV cache fragmentation after processing many varied-length inputs. Memory grows monotonically but is recoverable via worker restart.' },
      ],
      recommendations: [
        { action: 'Schedule vLLM worker restart during low traffic', risk: 'low', description: 'Planned restart clears fragmentation.' },
        { action: 'Enable --enable-prefix-caching', risk: 'low', description: 'Reduces KV cache fragmentation for repeated prefixes.' },
      ],
    },
    conversation_history: [],
    action_log: [
      { timestamp: ts(1500), user_id: 'system', action: 'Incident auto-created', result: '' },
      { timestamp: ts(1480), user_id: 'ops@ultralisk.com', action: 'Marked as false positive — known pattern under investigation', result: 'Incident suppressed for 24h' },
    ],
    triggered_at: ts(1500), mitigated_at: null, resolved_at: null, suppressed_at: ts(1480),
  },
  {
    id: 'inc_006', severity: 'critical', status: 'open', title: 'Error Rate Surge — llama-prod',
    description: '5xx error rate >5% for 2 minutes on endpoint llama-prod',
    detection_type: 'error_surge',
    affected_entities: { cluster_id: 'cl_001', node_id: null, model_id: 'llama-3.3-70b-instruct', endpoint_id: 'ep_001' },
    ai_analysis: {
      model_used: 'deepseek-v4-pro', completed_at: ts(3),
      root_causes: [
        { cause: 'Upstream API dependency failure', confidence: 0.88, evidence: 'Error logs show HTTP 502 from embedding service. 5xx rate spiked from 0.1% to 8.2% in 1 minute.' },
        { cause: 'Authentication token rotation', confidence: 0.35, evidence: 'A new API key was deployed at the same time — key might not have propagated to all workers.' },
      ],
      recommendations: [
        { action: 'Verify embedding service health', risk: 'low', description: 'Check embedding service pod status and connectivity.' },
        { action: 'Roll back API key if authentication related', risk: 'medium', description: 'Requires verifying token propagation before rollback.' },
      ],
    },
    conversation_history: [],
    action_log: [
      { timestamp: ts(5), user_id: 'system', action: 'Incident auto-created from Prometheus alert', result: '' },
    ],
    triggered_at: ts(5), mitigated_at: null, resolved_at: null, suppressed_at: null,
  },
];

export const MOCK_ALERTS = MOCK_INCIDENTS.map((inc) => ({
  id: `alert_${inc.id.slice(4)}`, incident_id: inc.id, name: inc.title,
  description: inc.description, severity: inc.severity,
  source_metric: `prometheus:${inc.detection_type}`,
  condition: { threshold: 40, duration: '10m', comparison: 'gt' },
  status: inc.status === 'resolved' || inc.status === 'suppressed' ? 'resolved' : 'firing',
  fired_at: inc.triggered_at, resolved_at: inc.resolved_at,
  notification_channels: ['email', 'slack'],
}));

export const MOCK_AUTO_REMEDIATION = {
  enabled: true,
  tiers: {
    tier1: {
      enabled: true, operations: [
        { id: 'restart_vllm', label: 'Restart crashed vLLM worker', enabled: true },
        { id: 'clear_gpu_mem', label: 'Clear GPU memory (when no active requests)', enabled: true },
        { id: 'drain_overheated', label: 'Drain overheated node from LB', enabled: true },
      ],
    },
    tier2: {
      enabled: true, approval_channels: ['web', 'slack', 'email'], operations: [
        { id: 'scale_up', label: 'Scale up replicas', enabled: true },
        { id: 'rollback_deploy', label: 'Roll back deployment', enabled: true },
        { id: 'migrate_model', label: 'Migrate model to different node', enabled: false },
      ],
    },
    tier3: {
      enabled: true, operations: [
        { id: 'node_reboot', label: 'Node reboot', enabled: true },
        { id: 'cluster_config', label: 'Cluster config change', enabled: true },
        { id: 'gpu_driver_update', label: 'GPU driver update', enabled: false },
      ],
    },
  },
  auto_suppression: { enabled: true, window_hours: 24 },
};

export const MOCK_SLACK_CONFIG = {
  connected: false,
  workspace_name: null,
  channels: [],
  notifications: {
    critical: true, warning: true,
    ai_summary: true, incident_actions: true,
  },
  slash_commands: [
    { command: '/ultralisk incident <id>', description: 'Query incident status and AI analysis' },
    { command: '/ultralisk ask <question>', description: 'Ask AI assistant about recent incidents' },
  ],
};
```

### Step 1.2: Add endpoint handlers to index.ts

Read `packages/console-api/src/index.ts`. Update imports:
```typescript
import {
  ..., MOCK_INCIDENTS, MOCK_ALERTS, MOCK_AUTO_REMEDIATION, MOCK_SLACK_CONFIG,
} from './fixtures.js';
```

Add handlers BEFORE `// === Chat completions`:

```typescript
// === Incidents / Alerts (Phase 2d) ===
app.get('/v1/admin/incidents', (_req, res) => {
  res.json({ data: MOCK_INCIDENTS, pagination: { page: 1, limit: 20, total: MOCK_INCIDENTS.length } });
});

app.get('/v1/admin/incidents/:id', (req, res) => {
  const inc = MOCK_INCIDENTS.find((i: any) => i.id === req.params.id);
  if (!inc) return res.status(404).json({ error: { code: 'not_found', message: 'Incident not found' } });
  res.json({ data: inc });
});

app.patch('/v1/admin/incidents/:id', (req, res) => {
  const idx = MOCK_INCIDENTS.findIndex((i: any) => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: { code: 'not_found', message: 'Incident not found' } });
  MOCK_INCIDENTS[idx] = { ...MOCK_INCIDENTS[idx], ...req.body };
  res.json({ data: MOCK_INCIDENTS[idx] });
});

app.post('/v1/admin/incidents/:id/actions', (req, res) => {
  const inc = MOCK_INCIDENTS.find((i: any) => i.id === req.params.id);
  if (!inc) return res.status(404).json({ error: { code: 'not_found', message: 'Incident not found' } });
  const action = { timestamp: new Date().toISOString(), user_id: req.body?.user_id ?? 'system', action: req.body?.action ?? '', result: req.body?.result ?? '' };
  inc.action_log.push(action);
  res.status(201).json({ data: action });
});

app.get('/v1/admin/alerts', (_req, res) => {
  res.json({ data: MOCK_ALERTS, pagination: { page: 1, limit: 20, total: MOCK_ALERTS.length } });
});

app.post('/v1/admin/alerts/:id/suppress', (req, res) => {
  const alert = MOCK_ALERTS.find((a: any) => a.id === req.params.id);
  if (!alert) return res.status(404).json({ error: { code: 'not_found', message: 'Alert not found' } });
  alert.status = 'suppressed';
  res.json({ data: alert });
});

app.get('/v1/admin/settings/auto-remediation', (_req, res) => {
  res.json({ data: MOCK_AUTO_REMEDIATION });
});

app.patch('/v1/admin/settings/auto-remediation', (req, res) => {
  Object.assign(MOCK_AUTO_REMEDIATION, req.body);
  res.json({ data: MOCK_AUTO_REMEDIATION });
});

app.get('/v1/admin/settings/integrations/slack', (_req, res) => {
  res.json({ data: MOCK_SLACK_CONFIG });
});

app.post('/v1/admin/settings/integrations/slack/connect', (_req, res) => {
  MOCK_SLACK_CONFIG.connected = true;
  MOCK_SLACK_CONFIG.workspace_name = 'acme-ai.slack.com';
  MOCK_SLACK_CONFIG.channels = ['#infra-alerts', '#ml-ops'];
  res.json({ data: MOCK_SLACK_CONFIG });
});

app.post('/v1/admin/settings/integrations/slack/disconnect', (_req, res) => {
  MOCK_SLACK_CONFIG.connected = false;
  MOCK_SLACK_CONFIG.workspace_name = null;
  res.json({ data: MOCK_SLACK_CONFIG });
});
```

### Step 1.3: Verify
```bash
cd packages/console-api && pnpm dev & sleep 2 && curl -s http://localhost:3100/v1/admin/incidents | python3 -c "import sys,json; d=json.load(sys.stdin); print('Incidents:', len(d['data']))" && kill %1 2>/dev/null
git add packages/console-api/src && git commit -m "feat(api): add Incidents, Alerts, Auto-Remediation, and Slack config endpoints"
```

## TASK 2: Types, Routes, Sidebar

### Step 2.1: Add types

Read `packages/console-ui/src/types/index.ts`. Append:

```typescript
// === Incident (Phase 2d) ===
export interface IncidentRootCause { cause: string; confidence: number; evidence: string; }
export interface IncidentRecommendation { action: string; risk: 'low' | 'medium' | 'high'; description: string; }
export interface IncidentActionLog { timestamp: string; user_id: string; action: string; result: string; }
export interface IncidentConversation { timestamp: string; role: 'user' | 'assistant'; content: string; }
export interface Incident {
  id: string; severity: 'critical' | 'warning'; status: 'open' | 'investigating' | 'mitigated' | 'resolved' | 'suppressed';
  title: string; description: string; detection_type: string;
  affected_entities: { cluster_id?: string; node_id?: string; model_id?: string; endpoint_id?: string; };
  ai_analysis: { model_used: string; completed_at: string; root_causes: IncidentRootCause[]; recommendations: IncidentRecommendation[]; };
  conversation_history: IncidentConversation[];
  action_log: IncidentActionLog[];
  triggered_at: string; mitigated_at: string | null; resolved_at: string | null; suppressed_at: string | null;
}

// === Alert (Phase 2d) ===
export interface Alert {
  id: string; incident_id: string; name: string; description: string; severity: string;
  source_metric: string; status: 'firing' | 'resolved' | 'suppressed';
  fired_at: string; resolved_at: string | null; notification_channels: string[];
}

// === Auto-Remediation (Phase 2d) ===
export interface RemediationOperation { id: string; label: string; enabled: boolean; }
export interface AutoRemediationConfig {
  enabled: boolean;
  tiers: {
    tier1: { enabled: boolean; operations: RemediationOperation[]; };
    tier2: { enabled: boolean; approval_channels: string[]; operations: RemediationOperation[]; };
    tier3: { enabled: boolean; operations: RemediationOperation[]; };
  };
  auto_suppression: { enabled: boolean; window_hours: number; };
}

// === Slack Config (Phase 2d) ===
export interface SlackConfig {
  connected: boolean; workspace_name: string | null; channels: string[];
  notifications: { critical: boolean; warning: boolean; ai_summary: boolean; incident_actions: boolean; };
  slash_commands: { command: string; description: string; }[];
}
```

### Step 2.2: Create API + hooks

Create `packages/console-ui/src/api/incidents.ts`:
```typescript
import { apiFetch } from './client';
import type { PaginatedResponse, SingleResponse, Incident } from '@/types';
export async function getIncidents() { return apiFetch<PaginatedResponse<Incident>>('/v1/admin/incidents'); }
export async function getIncident(id: string) { return apiFetch<SingleResponse<Incident>>(`/v1/admin/incidents/${id}`); }
export async function updateIncident(id: string, data: Partial<Incident>) { return apiFetch<SingleResponse<Incident>>(`/v1/admin/incidents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }); }
export async function addIncidentAction(id: string, data: { action: string; result?: string }) { return apiFetch(`/v1/admin/incidents/${id}/actions`, { method: 'POST', body: JSON.stringify(data) }); }
```

Create `packages/console-ui/src/hooks/useIncidents.ts`:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getIncidents, getIncident, updateIncident, addIncidentAction } from '@/api/incidents';
export function useIncidents() { return useQuery({ queryKey: ['incidents'], queryFn: () => getIncidents().then((r) => r.data), refetchInterval: 15_000 }); }
export function useIncident(id: string) { return useQuery({ queryKey: ['incidents', id], queryFn: () => getIncident(id).then((r) => r.data), enabled: !!id }); }
export function useUpdateIncident() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, data }: { id: string; data: Partial<Incident> }) => updateIncident(id, data).then((r) => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['incidents'] }) }); }
```

Create `packages/console-ui/src/api/alerts.ts`:
```typescript
import { apiFetch } from './client';
import type { PaginatedResponse, SingleResponse, Alert, AutoRemediationConfig, SlackConfig } from '@/types';
export async function getAlerts() { return apiFetch<PaginatedResponse<Alert>>('/v1/admin/alerts'); }
export async function suppressAlert(id: string) { return apiFetch<SingleResponse<Alert>>(`/v1/admin/alerts/${id}/suppress`, { method: 'POST' }); }
export async function getAutoRemediation() { return apiFetch<SingleResponse<AutoRemediationConfig>>('/v1/admin/settings/auto-remediation'); }
export async function updateAutoRemediation(data: Partial<AutoRemediationConfig>) { return apiFetch<SingleResponse<AutoRemediationConfig>>('/v1/admin/settings/auto-remediation', { method: 'PATCH', body: JSON.stringify(data) }); }
export async function getSlackConfig() { return apiFetch<SingleResponse<SlackConfig>>('/v1/admin/settings/integrations/slack'); }
export async function connectSlack() { return apiFetch<SingleResponse<SlackConfig>>('/v1/admin/settings/integrations/slack/connect', { method: 'POST' }); }
export async function disconnectSlack() { return apiFetch<SingleResponse<SlackConfig>>('/v1/admin/settings/integrations/slack/disconnect', { method: 'POST' }); }
```

Create `packages/console-ui/src/hooks/useAlerts.ts`:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAlerts, getAutoRemediation, updateAutoRemediation, getSlackConfig, connectSlack, disconnectSlack } from '@/api/alerts';
export function useAlerts() { return useQuery({ queryKey: ['alerts'], queryFn: () => getAlerts().then((r) => r.data) }); }
export function useAutoRemediation() { return useQuery({ queryKey: ['auto-remediation'], queryFn: () => getAutoRemediation().then((r) => r.data) }); }
export function useUpdateAutoRemediation() { const qc = useQueryClient(); return useMutation({ mutationFn: (d: Partial<AutoRemediationConfig>) => updateAutoRemediation(d).then((r) => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['auto-remediation'] }) }); }
export function useSlackConfig() { return useQuery({ queryKey: ['slack-config'], queryFn: () => getSlackConfig().then((r) => r.data) }); }
export function useConnectSlack() { const qc = useQueryClient(); return useMutation({ mutationFn: () => connectSlack().then((r) => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['slack-config'] }) }); }
export function useDisconnectSlack() { const qc = useQueryClient(); return useMutation({ mutationFn: () => disconnectSlack().then((r) => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['slack-config'] }) }); }
```

### Step 2.3: Add routes and sidebar items

Read App.tsx. Add imports:
```typescript
import { IncidentsPage } from '@/pages/incidents/IncidentsPage';
import { IncidentDetailPage } from '@/pages/incidents/IncidentDetailPage';
import { OperationsSettingsPage } from '@/pages/settings/OperationsSettingsPage';
import { IntegrationsPage } from '@/pages/settings/IntegrationsPage';
```

Add routes inside ConsoleLayout:
```typescript
<Route path="/incidents" element={<IncidentsPage />} />
<Route path="/incidents/:id" element={<IncidentDetailPage />} />
<Route path="/settings/operations" element={<OperationsSettingsPage />} />
<Route path="/settings/integrations" element={<IntegrationsPage />} />
```

Read Sidebar.tsx. Add `IconAlertTriangle, IconSettings, IconSlash` to imports. Add Incident item to Operations section:
```typescript
{ label: 'Incidents', icon: IconAlertTriangle, path: '/incidents' },
```

Create placeholder pages:
- packages/console-ui/src/pages/incidents/IncidentsPage.tsx
- packages/console-ui/src/pages/incidents/IncidentDetailPage.tsx
- packages/console-ui/src/pages/settings/OperationsSettingsPage.tsx
- packages/console-ui/src/pages/settings/IntegrationsPage.tsx

Each: `export function XxxPage() { return null; }`

### Step 2.4: Commit
```bash
cd packages/console-ui && pnpm typecheck
git add packages/console-ui/src packages/console-api/src
git commit -m "feat: add Incidents API, types, routes, and sidebar items"
```

## Acceptance Contract
Acceptance level: reviewed
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope
- criterion-2: Return evidence sufficient for an independent acceptance review

Required evidence: changed-files, tests-added, commands-run, validation-output, residual-risks, no-staged-files

Review gate: required by reviewer.

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