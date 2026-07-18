/**
 * Incident Engine — Alert → Incident → Analysis → Remediation orchestration.
 *
 * Connects Prometheus alerts, GPU metric thresholds, and internal events
 * to the incident lifecycle: create → AI analyze → auto-remediate → resolve.
 *
 * Three entry points:
 *   1. handleAlertWebhook()   — Prometheus Alertmanager callback
 *   2. checkThresholds()      — Polling-based GPU metric checks (no Prometheus)
 *   3. autoResolveStale()     — Periodic cleanup of stale mitigated incidents
 */

import pool from '../db/index.js';
import { logger } from '../logger.js';
import { fetchRelatedMetrics } from './incidentMetrics.js';
import { analyzeIncident } from './aiDiagnosisService.js';
import { executeRemediation } from './autoRemediationService.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PrometheusAlert {
  status: 'firing' | 'resolved';
  labels: Record<string, string>;
  annotations: Record<string, string>;
  startsAt: string;
  endsAt: string;
  generatorURL: string;
  fingerprint: string;
}

export interface AlertmanagerWebhook {
  receiver: string;
  status: 'firing' | 'resolved';
  alerts: PrometheusAlert[];
  groupLabels?: Record<string, string>;
  commonLabels?: Record<string, string>;
  commonAnnotations?: Record<string, string>;
  externalURL?: string;
}

// ── Threshold rule for polling-based detection ───────────────────────────────

interface ThresholdRule {
  name: string;
  description: string;
  severity: 'critical' | 'warning';
  metric: string;           // 'gpu_utilization' | 'temperature' | 'memory_used_mb'
  condition: 'drop' | 'spike' | 'above' | 'below';
  threshold: number;
  windowMinutes: number;
  cooldownMinutes: number;  // Min time between re-triggers
  orgId?: string;
}

const DEFAULT_THRESHOLD_RULES: ThresholdRule[] = [
  {
    name: 'GPU utilization crash',
    description: 'GPU utilization dropped below 10% after sustained operation',
    severity: 'critical',
    metric: 'gpu_utilization',
    condition: 'drop',
    threshold: 10,
    windowMinutes: 5,
    cooldownMinutes: 30,
  },
  {
    name: 'GPU temperature critical',
    description: 'GPU temperature exceeded 85°C',
    severity: 'warning',
    metric: 'temperature',
    condition: 'above',
    threshold: 85,
    windowMinutes: 5,
    cooldownMinutes: 15,
  },
  {
    name: 'GPU memory pressure',
    description: 'GPU memory usage above 90% capacity',
    severity: 'warning',
    metric: 'memory_used_mb',
    condition: 'above',
    threshold: 0.9,  // 90% of total memory
    windowMinutes: 5,
    cooldownMinutes: 15,
  },
];

// ── Alert deduplication ──────────────────────────────────────────────────────

/**
 * Check if an alert with this fingerprint already has an open incident.
 */
async function findExistingOpenIncident(fingerprint: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT i.id FROM incidents i
     JOIN alerts a ON a.incident_id = i.id
     WHERE a.fingerprint = $1
       AND i.status IN ('open', 'investigating')
     LIMIT 1`,
    [fingerprint]
  );
  return rows[0]?.id || null;
}

/**
 * Check if a threshold-based incident was recently created (cooldown).
 */
async function isInCooldown(ruleName: string, cooldownMinutes: number): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM incidents
     WHERE title LIKE $1
       AND created_at > NOW() - ($2 || ' minutes')::INTERVAL
     LIMIT 1`,
    [`${ruleName}%`, cooldownMinutes]
  );
  return rows.length > 0;
}

// ── Alert handler ────────────────────────────────────────────────────────────

/**
 * Handle a Prometheus Alertmanager webhook payload.
 * Creates/updates incidents and links alerts to them.
 */
export async function handleAlertWebhook(webhook: AlertmanagerWebhook): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  if (!webhook.alerts || !Array.isArray(webhook.alerts)) {
    return { created: 0, updated: 0 };
  }
  for (const alert of webhook.alerts) {
    try {
      if (alert.status === 'resolved') {
        // Mark the linked incident as mitigated
        const { rows } = await pool.query(
          `UPDATE incidents SET status = 'mitigated', mitigated_at = NOW()
           WHERE id IN (
             SELECT incident_id FROM alerts
             WHERE fingerprint = $1 AND incident_id IS NOT NULL
           )
           AND status IN ('open', 'investigating')
           RETURNING id`,
          [alert.fingerprint]
        );
        if (rows.length > 0) {
          updated++;
          logger.info({ incidentId: rows[0].id, fingerprint: alert.fingerprint }, 'Incident auto-mitigated by alert resolution');
        }
        // Also update the alert status
        await pool.query(
          `UPDATE alerts SET status = 'resolved', resolved_at = NOW()
           WHERE fingerprint = $1 AND status = 'firing'`,
          [alert.fingerprint]
        );
        continue;
      }

      // status === 'firing'
      // Deduplicate: check if there's already an open incident for this fingerprint
      const existingId = await findExistingOpenIncident(alert.fingerprint);
      if (existingId) {
        logger.debug({ incidentId: existingId, fingerprint: alert.fingerprint }, 'Alert already has open incident — skipping');
        continue;
      }

      // Extract fields from labels/annotations
      const severity = alert.labels.severity || 'warning';
      const title = alert.annotations.summary || alert.labels.alertname || 'GPU alert';
      const description = alert.annotations.description || '';
      const sourceMetric = alert.labels.alertname || 'unknown';
      const orgId = alert.labels.org_id || null;

      // Extract affected entities from labels
      const affectedEntities: Record<string, string> = {};
      if (alert.labels.node) affectedEntities.node_id = alert.labels.node;
      if (alert.labels.node_id) affectedEntities.node_id = alert.labels.node_id;
      if (alert.labels.model) affectedEntities.model_id = alert.labels.model;
      if (alert.labels.model_id) affectedEntities.model_id = alert.labels.model_id;
      if (alert.labels.cluster) affectedEntities.cluster_id = alert.labels.cluster;
      if (alert.labels.endpoint) affectedEntities.endpoint_id = alert.labels.endpoint;

      // Create the incident
      const { rows: [inc] } = await pool.query(
        `INSERT INTO incidents (severity, title, description, detection_type, affected_entities, triggered_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [severity, title, description, 'prometheus', JSON.stringify(affectedEntities), alert.startsAt || new Date().toISOString()]
      );

      // Create the alert record linked to this incident
      await pool.query(
        `INSERT INTO alerts (incident_id, name, description, severity, source_metric, condition, status, fired_at, fingerprint, org_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          inc.id,
          alert.labels.alertname || title,
          description,
          severity,
          sourceMetric,
          JSON.stringify(alert.labels),
          'firing',
          alert.startsAt || new Date().toISOString(),
          alert.fingerprint,
          orgId,
        ]
      );

      created++;

      // Trigger AI analysis + auto-remediation (async, fire-and-forget)
      runIncidentPipeline(inc, orgId).catch((err) =>
        logger.error({ err, incidentId: inc.id }, 'Incident pipeline failed after webhook')
      );

    } catch (err) {
      logger.error({ err, fingerprint: alert.fingerprint }, 'Failed to process alert');
    }
  }

  return { created, updated };
}

// ── Threshold checking ──────────────────────────────────────────────────────

/**
 * Poll-based GPU metric threshold checking.
 * For environments without Prometheus, this provides basic incident auto-creation.
 */
export async function checkThresholds(): Promise<{ created: number }> {
  let created = 0;

  for (const rule of DEFAULT_THRESHOLD_RULES) {
    try {
      // Check cooldown
      const inCooldown = await isInCooldown(rule.name, rule.cooldownMinutes);
      if (inCooldown) continue;

      // Fetch latest metrics across all nodes
      const { rows } = await pool.query(`
        SELECT DISTINCT ON (gms.node_id)
          gms.node_id, gms.card_index, gms.utilization_pct,
          gms.memory_used_mb, gms.temperature, gms.timestamp,
          gc.memory_mb AS total_memory_mb
        FROM gpu_metric_snapshots gms
        JOIN gpu_cards gc ON gc.node_id = gms.node_id AND gc.card_index = gms.card_index
        WHERE gms.timestamp > NOW() - ($1 || ' minutes')::INTERVAL
        ORDER BY gms.node_id, gms.timestamp DESC
      `, [rule.windowMinutes]);

      if (rows.length === 0) continue;

      let triggered = false;
      let triggerNode = '';
      let triggerValue = 0;

      for (const row of rows) {
        let value = 0;
        if (rule.metric === 'gpu_utilization') value = Number(row.utilization_pct);
        else if (rule.metric === 'temperature') value = Number(row.temperature);
        else if (rule.metric === 'memory_used_mb') {
          const totalMem = Number(row.total_memory_mb) || 81920;
          value = Number(row.memory_used_mb) / totalMem; // ratio
        }

        if (rule.condition === 'drop' && value < rule.threshold) {
          // Check it wasn't always low — verify there was a prior higher value
          const { rows: prior } = await pool.query(
            `SELECT utilization_pct FROM gpu_metric_snapshots
             WHERE node_id = $1 AND timestamp < $2
             ORDER BY timestamp DESC LIMIT 1`,
            [row.node_id, row.timestamp]
          );
          if (prior.length > 0 && Number(prior[0].utilization_pct) > rule.threshold * 2) {
            triggered = true;
            triggerNode = row.node_id;
            triggerValue = value;
          }
        } else if (rule.condition === 'above' && value > rule.threshold) {
          triggered = true;
          triggerNode = row.node_id;
          triggerValue = value;
        }
      }

      if (!triggered) continue;

      // Create incident
      const { rows: [inc] } = await pool.query(
        `INSERT INTO incidents (severity, title, description, detection_type, affected_entities, triggered_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          rule.severity,
          rule.name,
          `${rule.description} — node ${triggerNode} value=${triggerValue.toFixed(1)} threshold=${rule.threshold}`,
          'threshold',
          JSON.stringify({ node_id: triggerNode }),
          new Date().toISOString(),
        ]
      );
      created++;

      runIncidentPipeline(inc, null).catch((err) =>
        logger.error({ err, incidentId: inc.id }, 'Incident pipeline failed after threshold check')
      );

    } catch (err) {
      logger.error({ err, rule: rule.name }, 'Threshold check failed');
    }
  }

  return { created };
}

// ── Stale incident resolution ───────────────────────────────────────────────

/**
 * Auto-close mitigated incidents that haven't been resolved for 24 hours.
 */
export async function autoResolveStale(): Promise<{ resolved: number }> {
  const { rows } = await pool.query(
    `UPDATE incidents SET status = 'resolved', resolved_at = NOW()
     WHERE status = 'mitigated'
       AND mitigated_at < NOW() - INTERVAL '24 hours'
     RETURNING id`
  );
  if (rows.length > 0) {
    logger.info({ count: rows.length }, 'Auto-resolved stale mitigated incidents');
  }
  return { resolved: rows.length };
}

// ── Shared pipeline ─────────────────────────────────────────────────────────

/**
 * Full incident lifecycle pipeline: AI analysis → auto-remediation.
 * Called after incident creation.
 */
async function runIncidentPipeline(inc: any, orgId: string | null): Promise<void> {
  try {
    const entities = inc.affected_entities || {};

    // Fetch metrics
    const metrics = await fetchRelatedMetrics({
      nodeId: entities.node_id || entities.nodeId,
      windowMinutes: 30,
    });

    // AI diagnosis
    const diagnosis = await analyzeIncident({
      incidentId: inc.id,
      title: inc.title,
      description: inc.description || '',
      severity: inc.severity,
      affectedEntities: {
        clusterId: entities.cluster_id || entities.clusterId,
        nodeId: entities.node_id || entities.nodeId,
        modelId: entities.model_id || entities.modelId,
        endpointId: entities.endpoint_id || entities.endpointId,
      },
      metrics,
    });

    await pool.query(
      'UPDATE incidents SET ai_analysis = $2 WHERE id = $1',
      [inc.id, JSON.stringify(diagnosis)]
    );

    // Auto-remediation
    if (diagnosis.recommendations && diagnosis.recommendations.length > 0 && orgId) {
      await executeRemediation(inc.id, orgId, diagnosis);
    }

    logger.info({
      incidentId: inc.id,
      topCause: diagnosis.root_causes?.[0]?.cause,
      recommendations: diagnosis.recommendations?.length,
    }, 'Incident pipeline completed');
  } catch (err) {
    logger.error({ err, incidentId: inc.id }, 'Incident pipeline failed');
  }
}

// ── Background cron ─────────────────────────────────────────────────────────

let engineStarted = false;

/**
 * Start background timers for stale resolution and threshold checks.
 * Called once at boot from index.ts.
 */
export function startIncidentEngine(): void {
  if (engineStarted) return;
  engineStarted = true;

  // Auto-resolve stale mitigated incidents (every 30 minutes)
  setInterval(() => {
    autoResolveStale().catch((err) => logger.error({ err }, 'Stale resolution tick failed'));
  }, 30 * 60 * 1000).unref();

  // Threshold check (every 2 minutes)
  setInterval(() => {
    checkThresholds().catch((err) => logger.error({ err }, 'Threshold check tick failed'));
  }, 2 * 60 * 1000).unref();

  logger.info('Incident engine started (stale resolution @ 30min, threshold check @ 2min)');
}
