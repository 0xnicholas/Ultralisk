import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();
const STARTED_AT = new Date().toISOString();

// Liveness: process is up and accepting requests. Cheap, no DB hit.
// Used by k8s livenessProbe — failing this restarts the pod.
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'console-api',
    version: process.env.npm_package_version ?? 'dev',
    started_at: STARTED_AT,
    uptime_seconds: Math.floor(process.uptime()),
  });
});

// Readiness: DB pool can hand out a connection within a short window.
// Used by k8s readinessProbe — failing this removes the pod from
// the Service endpoints but doesn't restart it.
router.get('/health/ready', async (_req: Request, res: Response) => {
  const checks: Record<string, { ok: boolean; latency_ms?: number; error?: string }> = {};
  let ok = true;

  const t0 = Date.now();
  try {
    const client = await Promise.race([
      pool.connect(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('connect timeout')), 1500)),
    ]);
    try {
      await client.query('SELECT 1');
      checks.database = { ok: true, latency_ms: Date.now() - t0 };
    } finally {
      client.release();
    }
  } catch (err) {
    ok = false;
    checks.database = { ok: false, latency_ms: Date.now() - t0, error: (err as Error).message };
  }

  res.status(ok ? 200 : 503).json({ status: ok ? 'ready' : 'not_ready', checks });
});

export default router;
