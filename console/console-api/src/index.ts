import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEPLOYMENT_MODE = (process.env.DEPLOYMENT_MODE || 'saas') as 'saas' | 'private';
const IS_PROD = process.env.NODE_ENV === 'production';

// Shared route modules
import authRoutes from './routes/auth.js';
import modelRoutes from './routes/models.js';
import orgRoutes from './routes/organization.js';
import orgUpdateRoutes from './routes/organizationUpdate.js';
import usageRoutes from './routes/usage.js';
import playgroundRoutes from './routes/playground.js';
import endpointRoutes from './routes/endpoints.js';
import batchJobRoutes from './routes/batchJobs.js';
import sessionRoutes from './routes/sessions.js';
import clustersRoutes from './routes/clusters.js';
import nodesRoutes from './routes/nodes.js';
import deploymentsRoutes from './routes/deployments.js';
import incidentsRoutes from './routes/incidents.js';
import alertsRoutes from './routes/alerts.js';
import settingsRoutes from './routes/settings.js';
import gpuUtilizationRoutes from './routes/gpuUtilization.js';
import costAnalyticsRoutes from './routes/costAnalytics.js';
import modelRegistryRoutes from './routes/modelRegistry.js';
import auditLogRoutes from './routes/auditLogs.js';
import ssoConfigRoutes from './routes/ssoConfig.js';
import licenseRoutes from './routes/license.js';
import complianceRoutes from './routes/compliance.js';
import webhookRoutes from './routes/webhooks.js';
import healthRoutes from './routes/health.js';

// Mode-specific route modules
import apiKeyRoutes from './routes/apiKeys.js';
import billingRoutes from './routes/billing.js';

import { migrate } from './db/migrate.js';
import pool from './db/index.js';
import { startUsageCron, releaseUsageCronLock } from './services/usageCron.js';
import { startGpuMetricsCollector } from './services/gpuMetricsCollector.js';
import { startIncidentEngine } from './services/incidentEngine.js';
import { initClickHouse } from './services/clickhouseClient.js';
import { migrateClickHouse } from './services/clickhouseMigrate.js';
import { auditMiddleware } from './services/auditLog.js';
import { authMiddleware } from './middleware/auth.js';
import { rbacMiddleware } from './middleware/rbac.js';
import { checkNotificationDependencies } from './services/notificationService.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { logger } from './logger.js';

const app = express();
app.use(requestIdMiddleware); // before everything so every log line carries req_id
// CORS configuration.
// In production, set CORS_ORIGINS to a comma-separated list of allowed origins,
// e.g.: CORS_ORIGINS=https://console.ultralisk.ai,https://admin.ultralisk.ai
//
// - Explicit list → only those origins are allowed.
// - Empty string → cross-origin requests are denied (same-origin only).
// - Unset (default) → a warning is logged and same-origin is enforced.
//
// In development, all origins are allowed (for Vite dev proxy).
const CORS_ORIGINS = process.env.CORS_ORIGINS;
if (!IS_PROD) {
  app.use(cors({ origin: true, credentials: true }));
} else if (CORS_ORIGINS !== undefined) {
  const origins = CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  if (origins.length === 0) {
    logger.warn('CORS_ORIGINS is set but empty — cross-origin requests will be denied. Remove the env var to suppress this warning.');
  }
  app.use(cors({
    origin: origins.length === 0 ? false : origins,
    credentials: true,
  }));
} else {
  logger.warn('CORS_ORIGINS is not set. Cross-origin requests will be denied. ' +
    'Set CORS_ORIGINS=https://console.ultralisk.ai,https://admin.ultralisk.ai to allow access from your UI domain(s).');
  app.use(cors({ origin: false, credentials: true }));
}
app.use(express.json());

// Run all migrations on startup
migrate().catch((err) => logger.error({ err }, 'migrate failed at boot'));
startUsageCron();
startGpuMetricsCollector();
startIncidentEngine();

// Initialize ClickHouse asynchronously (non-blocking — falls back to PG)
initClickHouse()
  .then(() => migrateClickHouse())
  .catch((err) => logger.error({ err }, 'ClickHouse init failed'));

// Check optional notification dependencies at boot
checkNotificationDependencies().catch((err) =>
  logger.error({ err }, 'notification dependency check failed')
);

// Audit logging middleware (logs mutating requests)
app.use('/v1/admin', auditMiddleware);

// === Auth middleware — validates JWT and sets x-user-id / x-org-id headers ===
// Login / logout / accept-invitation must remain unauthenticated.
const PUBLIC_ADMIN_PATHS = new Set([
  '/auth/login',
  '/auth/logout',
  '/auth/accept-invitation',
]);

// Webhook paths that must remain unauthenticated (signed by external systems)
const WEBHOOK_PATHS = [
  '/webhooks/prometheus/alert',
];

app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/index.html') return next();
  if (req.path.startsWith('/v1/admin/') || req.path === '/v1/admin') {
    const subPath = req.path.replace(/^\/v1\/admin/, '');
    if (PUBLIC_ADMIN_PATHS.has(subPath)) return next();
    // Webhook paths are unauthenticated — signed by external systems
    if (WEBHOOK_PATHS.some((p) => subPath.startsWith(p))) return next();
    return authMiddleware(req, res, next);
  }
  if (req.path.startsWith('/v1/playground') || req.path === '/v1/playground') {
    return authMiddleware(req, res, next);
  }
  // Auth is not required for /v1/chat/completions at the Console API level;
  // authentication happens at the Gateway. The RBAC middleware below still
  // checks role if available; falls back to readonly (denied) by default.
  next();
});

// === RBAC middleware — enforces role-based access on authenticated paths ===
app.use((req, res, next) => {
  const p = req.path;
  if (p.startsWith('/v1/admin/') || p === '/v1/admin' ||
      p === '/v1/chat/completions' || p.startsWith('/v1/playground')) {
    return rbacMiddleware(req, res, next);
  }
  next();
});

// === Runtime mode injection for frontend ===
app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/index.html') {
    const htmlPath = join(__dirname, '../../console-ui/dist/index.html');
    try {
      const html = readFileSync(htmlPath, 'utf-8')
        .replace('__DEPLOYMENT_MODE__', DEPLOYMENT_MODE);
      return res.type('html').send(html);
    } catch {
      // dev mode — Vite serves index.html, skip
      return next();
    }
  }
  next();
});

// === Health checks (unauthenticated, used by k8s probes) ===
app.use(healthRoutes);

// === Shared routes (both SaaS and Private) ===
app.use('/v1/admin', authRoutes);
app.use('/v1/admin', modelRoutes);
app.use('/v1/admin', orgRoutes);
app.use('/v1/admin', orgUpdateRoutes);
app.use('/v1/admin', usageRoutes);
app.use('/v1/admin', endpointRoutes);
app.use('/v1/admin', batchJobRoutes);
app.use('/v1/admin', sessionRoutes);
app.use('/v1', playgroundRoutes);
app.use('/v1/admin', clustersRoutes);
app.use('/v1/admin', nodesRoutes);
app.use('/v1/admin', deploymentsRoutes);
app.use('/v1/admin', incidentsRoutes);
app.use('/v1/admin', alertsRoutes);
app.use('/v1/admin', settingsRoutes);
app.use('/v1/admin', gpuUtilizationRoutes);
app.use('/v1/admin', costAnalyticsRoutes);
app.use('/v1/admin', modelRegistryRoutes);
app.use('/v1/admin', auditLogRoutes);
app.use('/v1/admin', ssoConfigRoutes);
app.use('/v1/admin', licenseRoutes);
app.use('/v1/admin', complianceRoutes);

// === Webhook routes (no auth — signed by Alertmanager config) ===
app.use('/v1/admin', webhookRoutes);

// === SaaS-specific routes ===
if (DEPLOYMENT_MODE === 'saas') {
  app.use('/v1/admin', apiKeyRoutes);
  app.use('/v1/admin', billingRoutes);
}

const PORT = Number(process.env.PORT) || 3100;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  logger.info({ port: PORT, mode: DEPLOYMENT_MODE }, 'Ultralisk Console API listening');
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(
      { port: PORT, pid: process.pid },
      'Port ' + PORT + ' already in use. A previous dev process is still bound to it. Run console/scripts/dev-clean.sh to clear zombies.'
    );
    process.exit(0); // exit cleanly so tsx watch can retry
  } else {
    logger.error({ err }, 'listen error');
    process.exit(1);
  }
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    // Release PG advisory locks held by the usage cron before closing the pool
    await releaseUsageCronLock();
    try { await pool.end(); } catch (err) { logger.error({ err }, 'pool.end failed during shutdown'); }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export { server, app };
