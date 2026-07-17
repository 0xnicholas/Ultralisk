/**
 * GPU metrics collector.
 *
 * In production, a sidecar or DaemonSet scrapes DCGM / Prometheus and
 * pushes metrics into gpu_metric_snapshots via POST /v1/admin/metrics.
 *
 * In dev mode (or when no real GPU cluster is available), this simulator
 * runs as a cron job and writes realistic synthetic data so the
 * gpu-utilization dashboard always has fresh data to display.
 *
 * Simulation pattern:
 *   - Weekdays 08:00–20:00 → higher utilization (60-90% on busy models)
 *   - Weekdays 20:00–08:00 → lower utilization (10-40%)
 *   - Weekends → idle-ish (5-25%)
 *   - GPU memory scales with utilization
 *   - Temperature follows utilization with inertia
 */

import pool from '../db/index.js';
import { logger } from '../logger.js';

// ── Configuration ────────────────────────────────────────────────────────────

const INTERVAL_MS = Number(process.env.GPU_METRICS_INTERVAL_MS) || 300_000; // 5 min
const IS_SIMULATOR = process.env.GPU_METRICS_SIMULATOR !== 'false'; // enabled by default

// Per-card state for smooth deltas (avoids jarring jumps)
interface CardState {
  utilPct: number;
  memMb: number;
  temp: number;
}

const cardStates = new Map<string, CardState>();

// ── Simulation helpers ───────────────────────────────────────────────────────

function getBaseUtilization(): number {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0=Sun, 6=Sat
  const isWeekend = day === 0 || day === 6;

  if (isWeekend) {
    return 8 + Math.random() * 18; // 8-26%
  }
  if (hour >= 8 && hour < 20) {
    return 55 + Math.random() * 35; // 55-90%
  }
  return 15 + Math.random() * 30; // 15-45%
}

function smoothValue(current: number, target: number, maxDelta: number = 8): number {
  if (Math.abs(target - current) > maxDelta) {
    return current + Math.sign(target - current) * maxDelta;
  }
  return target;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function simulateMetrics(existingCard: any): { utilizationPct: number; memoryUsedMb: number; temperature: number } {
  const cardKey = `${existingCard.node_id}-${existingCard.card_index}`;
  const prev = cardStates.get(cardKey);

  const baseUtil = getBaseUtilization();
  // Add per-card variance so cards on the same node show different values
  const variance = (existingCard.card_index % 3) * 5 - 5; // -5, 0, +5
  const targetUtil = clamp(baseUtil + variance, 3, 98);

  const utilPct = prev
    ? smoothValue(prev.utilPct, targetUtil, 6)
    : targetUtil;

  const totalMemMb = existingCard.memory_mb || 81920;
  const memRatio = utilPct / 100 * (0.4 + Math.random() * 0.4);
  const memoryUsedMb = Math.round(totalMemMb * memRatio);

  const targetTemp = 35 + utilPct * 0.55 + (Math.random() - 0.5) * 6;
  const temperature = prev
    ? Math.round(smoothValue(prev.temp, targetTemp, 3))
    : Math.round(targetTemp);

  cardStates.set(cardKey, { utilPct, memMb: memoryUsedMb, temp: temperature });

  return { utilizationPct: Math.round(utilPct), memoryUsedMb, temperature };
}

// ── Collector ────────────────────────────────────────────────────────────────

/**
 * Collect and store GPU metrics for all nodes + GPU cards.
 * This single function is called both by the cron timer and can be
 * invoked manually (e.g., from a test or a POST endpoint).
 */
export async function collectGpuMetrics(): Promise<number> {
  const { rows: cards } = await pool.query(`
    SELECT gc.id, gc.node_id, gc.card_index, gc.memory_mb
    FROM gpu_cards gc
    INNER JOIN nodes n ON n.id = gc.node_id AND n.status = 'online'
    ORDER BY gc.node_id, gc.card_index
  `);

  if (cards.length === 0) {
    logger.debug('gpu metrics: no online GPU cards found');
    return 0;
  }

  let inserted = 0;
  const now = new Date();

  for (const card of cards) {
    const metrics = IS_SIMULATOR
      ? simulateMetrics(card)
      : { utilizationPct: 0, memoryUsedMb: 0, temperature: 0 };

    await pool.query(
      `INSERT INTO gpu_metric_snapshots (node_id, card_index, timestamp, utilization_pct, memory_used_mb, temperature)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [card.node_id, card.card_index, now, metrics.utilizationPct, metrics.memoryUsedMb, metrics.temperature]
    );
    inserted++;
  }

  // Prune data older than 7 days to keep the table lean
  await pool.query(
    'DELETE FROM gpu_metric_snapshots WHERE timestamp < NOW() - INTERVAL \'7 days\''
  );

  return inserted;
}

// ── Cron startup ─────────────────────────────────────────────────────────────

let cronStarted = false;

export function startGpuMetricsCollector(): void {
  if (cronStarted) return;
  cronStarted = true;

  if (!IS_SIMULATOR) {
    logger.info('GPU metrics simulator disabled (GPU_METRICS_SIMULATOR=false). Waiting for external collector.');
    return;
  }

  // Run on startup
  setTimeout(() => {
    collectGpuMetrics().catch((err) => logger.error({ err }, 'gpu metrics collector start failed'));
  }, 3000);

  // Run periodically
  const timer = setInterval(() => {
    collectGpuMetrics().catch((err) => logger.error({ err }, 'gpu metrics collector tick failed'));
  }, INTERVAL_MS);
  timer.unref();

  logger.info({ intervalMs: INTERVAL_MS }, 'GPU metrics simulator started');
}
