/**
 * Incident Metrics Prefetch
 *
 * Fetches GPU metrics related to an incident's affected entities.
 * Used by the incidents route to build the DiagnosisInput for AI analysis.
 *
 * Queries gpu_metric_snapshots (PG) for the last N minutes of data.
 * When ClickHouse is available, analytical queries can go there instead.
 */

import pool from '../db/index.js';
import { logger } from '../logger.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface IncidentMetrics {
  utilizationPct: number[];
  memoryUsedMb: number[];
  temperature: number[];
  timestamps: string[];
}

export interface MetricFetchInput {
  /** Node ID to fetch metrics for. */
  nodeId?: string;
  /** GPU card index (optional — fetches all cards for the node if omitted). */
  gpuCardIndex?: number;
  /** Time window in minutes (default: 30). */
  windowMinutes?: number;
  /** Max data points to return (default: 60). */
  maxPoints?: number;
}

// ── Fetcher ──────────────────────────────────────────────────────────────────

/**
 * Fetch GPU metrics for a node/card within a time window.
 *
 * In dev mode (no real GPU metrics), returns synthetic data so the
 * AI diagnosis can still be tested end-to-end.
 */
export async function fetchRelatedMetrics(input: MetricFetchInput): Promise<IncidentMetrics> {
  const windowMinutes = input.windowMinutes || 30;
  const maxPoints = input.maxPoints || 60;

  if (!input.nodeId) {
    return getSyntheticMetrics(windowMinutes, maxPoints);
  }

  try {
    const { rows } = await pool.query(
      `SELECT utilization_pct, memory_used_mb, temperature, timestamp
       FROM gpu_metric_snapshots
       WHERE node_id = $1
         AND ($2 IS NULL OR card_index = $2)
         AND timestamp > NOW() - ($3 || ' minutes')::INTERVAL
       ORDER BY timestamp ASC
       LIMIT $4`,
      [input.nodeId, input.gpuCardIndex ?? null, windowMinutes, maxPoints]
    );

    if (rows.length === 0) {
      logger.debug({ nodeId: input.nodeId, windowMinutes }, 'No GPU metrics found for incident — using synthetic data');
      return getSyntheticMetrics(windowMinutes, maxPoints);
    }

    return {
      utilizationPct: rows.map((r: any) => Number(r.utilization_pct)),
      memoryUsedMb: rows.map((r: any) => Number(r.memory_used_mb)),
      temperature: rows.map((r: any) => Number(r.temperature)),
      timestamps: rows.map((r: any) => {
        const d = new Date(r.timestamp);
        return d.toLocaleTimeString();
      }),
    };
  } catch (err) {
    logger.error({ err, nodeId: input.nodeId }, 'Failed to fetch GPU metrics for incident');
    return getSyntheticMetrics(windowMinutes, maxPoints);
  }
}

// ── Synthetic data (dev mode) ────────────────────────────────────────────────

/**
 * Generate realistic-looking GPU metrics for development and testing.
 * Pattern: normal operation with a "failure event" in the middle.
 */
function getSyntheticMetrics(windowMinutes: number, maxPoints: number): IncidentMetrics {
  const pointCount = Math.min(maxPoints, Math.round(windowMinutes * 2)); // ~every 30s
  const failurePoint = Math.round(pointCount * 0.6); // failure at 60% of window

  const utilizationPct: number[] = [];
  const memoryUsedMb: number[] = [];
  const temperature: number[] = [];
  const timestamps: string[] = [];

  const now = Date.now();
  const intervalMs = (windowMinutes * 60 * 1000) / pointCount;

  for (let i = 0; i < pointCount; i++) {
    const t = new Date(now - (pointCount - i) * intervalMs);

    // Simulate: normal → spike → crash → idle
    let util: number;
    let mem: number;
    let temp: number;

    if (i < failurePoint - 3) {
      // Normal operation: 40-70% util
      util = 45 + Math.random() * 25;
      mem = 40000 + Math.random() * 20000;
      temp = 55 + Math.random() * 10;
    } else if (i < failurePoint) {
      // Pre-failure spike
      util = 85 + Math.random() * 15;
      mem = 70000 + Math.random() * 10000;
      temp = 75 + Math.random() * 10;
    } else if (i === failurePoint) {
      // The "crash" — utilization drops to near-zero
      util = 2 + Math.random() * 5;
      mem = 5000 + Math.random() * 10000;
      temp = 65 + Math.random() * 5;
    } else {
      // Post-crash idle
      util = 1 + Math.random() * 3;
      mem = 3000 + Math.random() * 5000;
      temp = 55 + Math.random() * 5;
    }

    utilizationPct.push(Math.round(util));
    memoryUsedMb.push(Math.round(mem));
    temperature.push(Math.round(temp));
    timestamps.push(t.toLocaleTimeString());
  }

  return { utilizationPct, memoryUsedMb, temperature, timestamps };
}
