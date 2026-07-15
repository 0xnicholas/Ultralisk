import express from 'express';
import cors from 'cors';
import {
  MOCK_GPU_UTILIZATION,
  MOCK_COST_DATA,
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

// Phase 2: DB-backed route modules
import clustersRoutes from './routes/clusters.js';
import nodesRoutes from './routes/nodes.js';
import deploymentsRoutes from './routes/deployments.js';
import incidentsRoutes from './routes/incidents.js';
import alertsRoutes from './routes/alerts.js';
import settingsRoutes from './routes/settings.js';
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

// === Phase 2: DB-backed route modules ===
app.use('/v1/admin', clustersRoutes);
app.use('/v1/admin', nodesRoutes);
app.use('/v1/admin', deploymentsRoutes);
app.use('/v1/admin', incidentsRoutes);
app.use('/v1/admin', alertsRoutes);
app.use('/v1/admin', settingsRoutes);

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

// === Phase 2: GPU utilization + cost analytics (ClickHouse/Prometheus data, mock for now) ===
app.get('/v1/admin/gpu-utilization', (_req, res) => res.json({ data: MOCK_GPU_UTILIZATION }));
app.get('/v1/admin/cost-analytics', (_req, res) => res.json({ data: MOCK_COST_DATA }));

const PORT = 3100;
app.listen(PORT, () => {
  console.log(`Ultralisk Console API running on http://localhost:${PORT}`);
});
