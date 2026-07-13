import express from 'express';
import cors from 'cors';
import {
  MOCK_CLUSTERS, MOCK_NODES, MOCK_GPU_CARDS, MOCK_DEPLOYMENTS, MOCK_DEPLOYMENT_VERSIONS,
  MOCK_GPU_UTILIZATION,
  MOCK_COST_DATA,
  MOCK_INCIDENTS, MOCK_ALERTS, MOCK_AUTO_REMEDIATION, MOCK_SLACK_CONFIG,
  MOCK_USER, MOCK_JWT,
} from './fixtures.js';

// Phase 1: Real data route modules
import authRoutes from './routes/auth.js';
import apiKeyRoutes from './routes/apiKeys.js';
import modelRoutes from './routes/models.js';
import orgRoutes from './routes/organization.js';
import orgUpdateRoutes from './routes/organizationUpdate.js';
import usageRoutes from './routes/usage.js';
import billingRoutes from './routes/billing.js';
import playgroundRoutes from './routes/playground.js';
import endpointRoutes from './routes/endpoints.js';
import batchJobRoutes from './routes/batchJobs.js';
import sessionRoutes from './routes/sessions.js';
import { migrate } from './db/migrate.js';
import { startUsageCron } from './services/usageCron.js';

const app = express();
app.use(cors());
app.use(express.json());

// Run Phase 1 table migrations on startup
migrate().catch(console.error);
startUsageCron();

// === Phase 1: Real data routes ===
app.use('/v1/admin', authRoutes);
app.use('/v1/admin', apiKeyRoutes);
app.use('/v1/admin', modelRoutes);
app.use('/v1/admin', orgRoutes);
app.use('/v1/admin', orgUpdateRoutes);
app.use('/v1/admin', usageRoutes);
app.use('/v1/admin', billingRoutes);
app.use('/v1/admin', endpointRoutes);
app.use('/v1/admin', batchJobRoutes);
app.use('/v1/admin', sessionRoutes);
app.use('/v1', playgroundRoutes);

// === Phase 1: Retained mock routes (invitations) ===
app.post('/v1/admin/auth/accept-invitation', (_req, res) => {
  res.json({ data: { user: MOCK_USER, jwt: MOCK_JWT } });
});
app.post('/v1/admin/invitations', (_req, res) => {
  res.status(201).json({ data: { token: 'mock-invite-token-' + Date.now(), email: (_req as any).body?.email ?? 'dev@example.com', expires_at: new Date(Date.now() + 7 * 86400000).toISOString() } });
});
app.get('/v1/admin/invitations', (_req, res) => {
  res.json({ data: [{ token: 'mock-invite-token-001', email: 'pending@example.com', status: 'pending', created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 86400000).toISOString() }] });
});

// === Phase 2: Mock routes (GPU data plane + operations — no KAI / Prometheus / Loki yet) ===

// Clusters / Nodes / Deployments / GPU / Cost
app.get('/v1/admin/clusters', (_req, res) => res.json({ data: MOCK_CLUSTERS, pagination: { page: 1, limit: 20, total: MOCK_CLUSTERS.length } }));
app.get('/v1/admin/clusters/:id', (req, res) => { const cluster = MOCK_CLUSTERS.find((c: any) => c.id === req.params.id); if (!cluster) return res.status(404).json({ error: { code: 'not_found' } }); const nodes = MOCK_NODES[cluster.id] ?? []; const totalGpu = nodes.reduce((s: number, n: any) => s + n.gpu_count, 0); const utils = nodes.flatMap((n: any) => MOCK_GPU_CARDS[n.id] ?? []).map((g: any) => g.utilization_percent); res.json({ data: { ...cluster, nodes, total_gpu: totalGpu, avg_gpu_util: utils.length > 0 ? Math.round(utils.reduce((a:number,b:number) => a+b,0) / utils.length) : 0 } }); });
app.get('/v1/admin/nodes', (_req, res) => { const all = Object.values(MOCK_NODES).flat(); res.json({ data: all, pagination: { page: 1, limit: 50, total: all.length } }); });
app.get('/v1/admin/nodes/:id', (req, res) => { const all = Object.values(MOCK_NODES).flat(); const node = (all as any[]).find((n: any) => n.id === req.params.id); if (!node) return res.status(404).json({ error: { code: 'not_found' } }); res.json({ data: { ...node, gpu_cards: MOCK_GPU_CARDS[node.id] ?? [] } }); });
app.get('/v1/admin/clusters/:clusterId/nodes/:nodeId', (req, res) => { const all = Object.values(MOCK_NODES).flat(); const node = (all as any[]).find((n: any) => n.id === req.params.nodeId && n.cluster_id === req.params.clusterId); if (!node) return res.status(404).json({ error: { code: 'not_found' } }); res.json({ data: { ...node, gpu_cards: MOCK_GPU_CARDS[node.id] ?? [] } }); });
app.get('/v1/admin/deployments', (_req, res) => res.json({ data: MOCK_DEPLOYMENTS, pagination: { page: 1, limit: 20, total: MOCK_DEPLOYMENTS.length } }));
app.get('/v1/admin/deployments/:id', (req, res) => { const dep = MOCK_DEPLOYMENTS.find((d: any) => d.id === req.params.id); if (!dep) return res.status(404).json({ error: { code: 'not_found' } }); const versions = MOCK_DEPLOYMENT_VERSIONS[dep.id] ?? []; res.json({ data: { ...dep, versions } }); });
app.post('/v1/admin/deployments/:id/scale', (req, res) => { const dep = MOCK_DEPLOYMENTS.find((d: any) => d.id === req.params.id); if (!dep) return res.status(404).json({ error: { code: 'not_found' } }); dep.replicas = req.body.replicas ?? dep.replicas; res.json({ data: dep }); });
app.post('/v1/admin/deployments/:id/rollback', (req, res) => { const dep = MOCK_DEPLOYMENTS.find((d: any) => d.id === req.params.id); if (!dep) return res.status(404).json({ error: { code: 'not_found' } }); res.json({ data: { ...dep, status: 'rolling_back' } }); });
app.get('/v1/admin/gpu-utilization', (_req, res) => res.json({ data: MOCK_GPU_UTILIZATION }));
app.get('/v1/admin/cost-analytics', (_req, res) => res.json({ data: MOCK_COST_DATA }));

// Incidents / Alerts / Settings
app.get('/v1/admin/incidents', (_req, res) => res.json({ data: MOCK_INCIDENTS, pagination: { page: 1, limit: 20, total: MOCK_INCIDENTS.length } }));
app.get('/v1/admin/incidents/:id', (req, res) => { const inc = MOCK_INCIDENTS.find((i: any) => i.id === req.params.id); if (!inc) return res.status(404).json({ error: { code: 'not_found' } }); res.json({ data: inc }); });
app.patch('/v1/admin/incidents/:id', (req, res) => { const idx = MOCK_INCIDENTS.findIndex((i: any) => i.id === req.params.id); if (idx === -1) return res.status(404).json({ error: { code: 'not_found' } }); MOCK_INCIDENTS[idx] = { ...MOCK_INCIDENTS[idx], ...req.body }; res.json({ data: MOCK_INCIDENTS[idx] }); });
app.post('/v1/admin/incidents/:id/actions', (req, res) => { const inc = MOCK_INCIDENTS.find((i: any) => i.id === req.params.id); if (!inc) return res.status(404).json({ error: { code: 'not_found' } }); const action = { timestamp: new Date().toISOString(), user_id: req.body?.user_id ?? 'system', action: req.body?.action ?? '', result: req.body?.result ?? '' }; inc.action_log.push(action); res.status(201).json({ data: action }); });
app.get('/v1/admin/alerts', (_req, res) => res.json({ data: MOCK_ALERTS, pagination: { page: 1, limit: 20, total: MOCK_ALERTS.length } }));
app.post('/v1/admin/alerts/:id/suppress', (req, res) => { const alert = MOCK_ALERTS.find((a: any) => a.id === req.params.id); if (!alert) return res.status(404).json({ error: { code: 'not_found' } }); alert.status = 'suppressed'; res.json({ data: alert }); });
app.get('/v1/admin/settings/auto-remediation', (_req, res) => res.json({ data: MOCK_AUTO_REMEDIATION }));
app.patch('/v1/admin/settings/auto-remediation', (req, res) => { Object.assign(MOCK_AUTO_REMEDIATION, req.body); res.json({ data: MOCK_AUTO_REMEDIATION }); });
app.get('/v1/admin/settings/integrations/slack', (_req, res) => res.json({ data: MOCK_SLACK_CONFIG }));
app.post('/v1/admin/settings/integrations/slack/connect', (_req, res) => { MOCK_SLACK_CONFIG.connected = true; MOCK_SLACK_CONFIG.workspace_name = 'acme-ai.slack.com'; MOCK_SLACK_CONFIG.channels = ['#infra-alerts', '#ml-ops']; res.json({ data: MOCK_SLACK_CONFIG }); });
app.post('/v1/admin/settings/integrations/slack/disconnect', (_req, res) => { MOCK_SLACK_CONFIG.connected = false; MOCK_SLACK_CONFIG.workspace_name = null; res.json({ data: MOCK_SLACK_CONFIG }); });
app.patch('/v1/admin/settings/integrations/slack', (req, res) => { Object.assign(MOCK_SLACK_CONFIG, req.body); res.json({ data: MOCK_SLACK_CONFIG }); });

const PORT = 3100;
app.listen(PORT, () => {
  console.log(`Ultralisk Console API running on http://localhost:${PORT}`);
});
