import express from 'express';
import cors from 'cors';
import {
  MOCK_USER, MOCK_JWT, MOCK_MODELS, MODEL_DETAILS,
  MOCK_USAGE, MOCK_BILLING, MOCK_API_KEYS,
  MOCK_ENDPOINTS, MOCK_BATCH_JOBS, MOCK_SESSIONS,
  MOCK_CLUSTERS, MOCK_NODES, MOCK_GPU_CARDS, MOCK_DEPLOYMENTS, MOCK_DEPLOYMENT_VERSIONS,
  MOCK_GPU_UTILIZATION,
  MOCK_COST_DATA,
  MOCK_INCIDENTS, MOCK_ALERTS, MOCK_AUTO_REMEDIATION, MOCK_SLACK_CONFIG,
  MOCK_ORGANIZATION,
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

// === GPU Utilization (Phase 2b) ===
app.get('/v1/admin/gpu-utilization', (_req, res) => {
  res.json({ data: MOCK_GPU_UTILIZATION });
});

// === Cost Analytics (Phase 2c) ===
app.get('/v1/admin/cost-analytics', (_req, res) => {
  res.json({ data: MOCK_COST_DATA });
});

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

// === Organization (Phase 2e) ===
app.get('/v1/admin/organization', (_req, res) => res.json({ data: MOCK_ORGANIZATION }));
app.patch('/v1/admin/organization', (req, res) => { Object.assign(MOCK_ORGANIZATION, req.body); res.json({ data: MOCK_ORGANIZATION }); });

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

const PORT = 3100;
app.listen(PORT, () => {
  console.log(`Ultralisk Console API stub running on http://localhost:${PORT}`);
});
