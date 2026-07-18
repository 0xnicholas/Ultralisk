/**
 * Auto-Remediation Service
 *
 * Executes Tier 1/2/3 remediation actions based on AI diagnosis results.
 *
 * Tier System:
 *   Tier 1 — Low risk, fully automated (restart worker, clear cache)
 *   Tier 2 — Medium risk, needs human approval (scale up, switch model)
 *   Tier 3 — High risk, human must execute (reboot node, rollback driver)
 *
 * All actions are logged to incidents.action_log for full audit trail.
 */

import pool from '../db/index.js';
import { logger } from '../logger.js';
import type { DiagnosisResult } from './aiDiagnosisService.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type RemediationActionType =
  | 'restart_worker'
  | 'clear_cache'
  | 'scale_up'
  | 'switch_model'
  | 'rollback_model'
  | 'reboot_node'
  | 'notify_support';

export type TierLevel = 1 | 2 | 3;

export type ActionStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface RemediationAction {
  type: RemediationActionType;
  target: string;
  reason: string;
  tier: TierLevel;
}

export interface ActionLogEntry {
  timestamp: string;
  action: string;
  tier: TierLevel;
  triggeredBy: 'system' | 'user';
  status: ActionStatus;
  details: Record<string, unknown>;
  result?: {
    success: boolean;
    message: string;
  };
}

export interface RemediationPolicy {
  orgId: string;
  enabled: boolean;
  /** Per-tier configuration from auto_remediation_settings.tiers JSONB */
  tiers: {
    tier1: { enabled: boolean; allowedActions: RemediationActionType[] };
    tier2: { enabled: boolean; allowedActions: RemediationActionType[] };
    tier3: { enabled: boolean; allowedActions: RemediationActionType[] };
  };
}

export interface RemediationResult {
  executed: ActionLogEntry[];
  skipped: ActionLogEntry[];
  needsApproval: ActionLogEntry[];
}

// ── Remediation action executors ─────────────────────────────────────────────

/**
 * Map from action type to an executor function.
 * Each executor returns a { success, message } result.
 *
 * In Phase C, executors are stubs that log the intended action.
 * In Phase D/E, they integrate with K8s API / Gateway / KAI Scheduler.
 */
const EXECUTORS: Record<RemediationActionType, (target: string, reason: string) => Promise<{ success: boolean; message: string }>> = {
  async restart_worker(target, reason) {
    // TODO Phase D: kubectl delete pod <target> on the worker node
    logger.info({ target, reason }, '[remediation] restart_worker');
    return { success: true, message: `Worker ${target} restart initiated` };
  },

  async clear_cache(target, reason) {
    // TODO Phase D: SSH/API call to clear GPU cache on target node
    logger.info({ target, reason }, '[remediation] clear_cache');
    return { success: true, message: `Cache clear initiated on ${target}` };
  },

  async scale_up(target, reason) {
    // TODO Phase D: PATCH /v1/admin/deployments/:id to increase replicas
    logger.info({ target, reason }, '[remediation] scale_up');
    return { success: true, message: `Scale-up of ${target} submitted` };
  },

  async switch_model(target, reason) {
    // TODO Phase D: Update route table to point to fallback model
    logger.info({ target, reason }, '[remediation] switch_model');
    return { success: true, message: `Model switch to ${target} initiated` };
  },

  async rollback_model(target, reason) {
    // TODO Phase D: Rollback deployment to previous version
    logger.info({ target, reason }, '[remediation] rollback_model');
    return { success: true, message: `Rollback to ${target} submitted` };
  },

  async reboot_node(target, reason) {
    // TODO Phase D: Cord + drain + reboot the K8s node
    logger.info({ target, reason }, '[remediation] reboot_node');
    return { success: true, message: `Node ${target} reboot scheduled` };
  },

  async notify_support(target, reason) {
    // TODO Phase D: Create support ticket or Slack notification
    logger.info({ target, reason }, '[remediation] notify_support');
    return { success: true, message: `Support notified: ${reason}` };
  },
};

// ── Policy loader ────────────────────────────────────────────────────────────

/**
 * Load the auto-remediation policy for an org.
 * Returns a default-allowed policy if no settings row exists.
 */
export async function loadPolicy(orgId: string): Promise<RemediationPolicy> {
  try {
    const { rows } = await pool.query(
      'SELECT enabled, tiers FROM auto_remediation_settings WHERE org_id = $1',
      [orgId]
    );
    if (rows.length === 0) {
      return defaultPolicy(orgId);
    }
    const r = rows[0];
    const tiers = r.tiers || {};
    return {
      orgId,
      enabled: r.enabled !== false,
      tiers: {
        tier1: {
          enabled: tiers.tier1?.enabled !== false,
          allowedActions: tiers.tier1?.allowedActions || ['restart_worker', 'clear_cache', 'notify_support'],
        },
        tier2: {
          enabled: tiers.tier2?.enabled !== false,
          allowedActions: tiers.tier2?.allowedActions || ['scale_up', 'switch_model', 'notify_support'],
        },
        tier3: {
          enabled: tiers.tier3?.enabled !== false,
          allowedActions: tiers.tier3?.allowedActions || ['rollback_model', 'reboot_node', 'notify_support'],
        },
      },
    };
  } catch (err) {
    logger.error({ err, orgId }, 'Failed to load remediation policy, using defaults');
    return defaultPolicy(orgId);
  }
}

function defaultPolicy(orgId: string): RemediationPolicy {
  return {
    orgId,
    enabled: true,
    tiers: {
      tier1: { enabled: true, allowedActions: ['restart_worker', 'clear_cache', 'notify_support'] },
      tier2: { enabled: true, allowedActions: ['scale_up', 'switch_model', 'notify_support'] },
      tier3: { enabled: true, allowedActions: ['rollback_model', 'reboot_node', 'notify_support'] },
    },
  };
}

// ── Action-to-Tier mapping ──────────────────────────────────────────────────

/**
 * Recommendations from the AI diagnosis include a `tier` field.
 * Map each recommendation to a concrete RemediationAction.
 */
function recommendationToAction(rec: { action: string; risk: string; tier: number }): RemediationAction | null {
  const actionText = rec.action.toLowerCase();

  // Heuristic: infer action type from recommendation text
  let type: RemediationActionType;
  if (actionText.includes('restart') || actionText.includes('reboot worker') || actionText.includes('kill')) {
    type = 'restart_worker';
  } else if (actionText.includes('cache') || actionText.includes('clear')) {
    type = 'clear_cache';
  } else if (actionText.includes('scale') || actionText.includes('increase') || actionText.includes('add replica')) {
    type = 'scale_up';
  } else if (actionText.includes('switch') || actionText.includes('fallback') || actionText.includes('alternative model')) {
    type = 'switch_model';
  } else if (actionText.includes('rollback') || actionText.includes('revert')) {
    type = 'rollback_model';
  } else if (actionText.includes('reboot') || actionText.includes('restart node') || actionText.includes('drain')) {
    type = 'reboot_node';
  } else if (actionText.includes('support') || actionText.includes('contact') || actionText.includes('escalate')) {
    type = 'notify_support';
  } else {
    // Generic action — notify support as default
    type = 'notify_support';
  }

  // Extract a target identifier from the action text (e.g., a node name or worker ID)
  const targetMatch = actionText.match(/\b(node|worker|model|deployment)[-\s]?(\S+)/i);
  const target = targetMatch ? `${targetMatch[1]}-${targetMatch[2]}` : 'unknown';

  return {
    type,
    target,
    reason: rec.action,
    tier: (rec.tier >= 1 && rec.tier <= 3 ? rec.tier : 2) as TierLevel,
  };
}

// ── Logging ──────────────────────────────────────────────────────────────────

async function appendToActionLog(incidentId: string, entry: ActionLogEntry): Promise<void> {
  try {
    const { rows } = await pool.query(
      'SELECT action_log FROM incidents WHERE id = $1',
      [incidentId]
    );
    const existing = rows[0]?.action_log || [];
    existing.push(entry);
    await pool.query(
      'UPDATE incidents SET action_log = $2 WHERE id = $1',
      [incidentId, JSON.stringify(existing)]
    );
  } catch (err) {
    logger.error({ err, incidentId }, 'Failed to append action log');
  }
}

// ── Main execution ───────────────────────────────────────────────────────────

/**
 * Execute remediation actions based on AI diagnosis recommendations.
 *
 * @param incidentId - The incident to remediate
 * @param orgId - Organization for policy lookup
 * @param diagnosis - The AI diagnosis result containing recommendations
 * @returns Summary of what was executed, skipped, and needs approval
 */
export async function executeRemediation(
  incidentId: string,
  orgId: string,
  diagnosis: DiagnosisResult,
): Promise<RemediationResult> {
  const result: RemediationResult = { executed: [], skipped: [], needsApproval: [] };

  // Load policy
  const policy = await loadPolicy(orgId);
  if (!policy.enabled) {
    logger.info({ incidentId }, 'Auto-remediation is disabled for this org');
    return result;
  }

  // Process each recommendation
  for (const rec of diagnosis.recommendations) {
    const action = recommendationToAction(rec);
    if (!action) continue;

    const tierConfig = action.tier === 1 ? policy.tiers.tier1
      : action.tier === 2 ? policy.tiers.tier2
      : policy.tiers.tier3;

    // Check if this tier is enabled
    if (!tierConfig.enabled) {
      result.skipped.push({
        timestamp: new Date().toISOString(),
        action: `auto_remediation.${action.type}`,
        tier: action.tier,
        triggeredBy: 'system',
        status: 'skipped',
        details: { target: action.target, reason: action.reason },
        result: { success: false, message: `Tier ${action.tier} remediation is disabled` },
      });
      continue;
    }

    // Check if this action type is allowed
    if (!tierConfig.allowedActions.includes(action.type)) {
      result.skipped.push({
        timestamp: new Date().toISOString(),
        action: `auto_remediation.${action.type}`,
        tier: action.tier,
        triggeredBy: 'system',
        status: 'skipped',
        details: { target: action.target, reason: action.reason },
        result: { success: false, message: `Action ${action.type} not in allowed list for tier ${action.tier}` },
      });
      continue;
    }

    // Execute Tier 1 immediately
    if (action.tier === 1) {
      const pendingEntry: ActionLogEntry = {
        timestamp: new Date().toISOString(),
        action: `auto_remediation.${action.type}`,
        tier: 1,
        triggeredBy: 'system',
        status: 'running',
        details: { target: action.target, reason: action.reason },
      };

      await appendToActionLog(incidentId, pendingEntry);

      const executor = EXECUTORS[action.type];
      try {
        const execResult = await executor(action.target, action.reason);
        const completedEntry: ActionLogEntry = {
          ...pendingEntry,
          status: execResult.success ? 'success' : 'failed',
          result: execResult,
        };
        await appendToActionLog(incidentId, completedEntry);
        result.executed.push(completedEntry);
        logger.info({
          incidentId,
          action: action.type,
          target: action.target,
          success: execResult.success,
        }, 'Tier 1 remediation executed');
      } catch (err: any) {
        const failedEntry: ActionLogEntry = {
          ...pendingEntry,
          status: 'failed',
          result: { success: false, message: err.message || 'Execution error' },
        };
        await appendToActionLog(incidentId, failedEntry);
        result.executed.push(failedEntry);
        logger.error({ err, incidentId, action: action.type }, 'Tier 1 remediation failed');
      }
    } else {
      // Tier 2 and 3 need human approval — log as needs approval
      const approvalEntry: ActionLogEntry = {
        timestamp: new Date().toISOString(),
        action: `auto_remediation.${action.type}`,
        tier: action.tier,
        triggeredBy: 'system',
        status: 'pending',
        details: { target: action.target, reason: action.reason },
      };
      // Still log to action_log so the UI and Slack can pick it up
      await appendToActionLog(incidentId, approvalEntry);
      result.needsApproval.push(approvalEntry);
    }
  }

  return result;
}

/**
 * Approve and execute a pending Tier 2/3 remediation action.
 * Called from Slack button callback or Console UI.
 */
export async function approveAction(
  incidentId: string,
  actionIndex: number,
  approvedBy: string,
): Promise<ActionLogEntry | null> {
  try {
    const { rows } = await pool.query(
      'SELECT action_log FROM incidents WHERE id = $1',
      [incidentId]
    );
    const log: ActionLogEntry[] = rows[0]?.action_log || [];
    const entry = log[actionIndex];
    if (!entry || entry.status !== 'pending') return null;

    // Parse the action from the log entry
    const actionType = entry.action.replace('auto_remediation.', '') as RemediationActionType;
    const executor = EXECUTORS[actionType];
    if (!executor) return null;

    const details = entry.details as { target?: string; reason?: string };
    const execResult = await executor(details?.target || 'unknown', details?.reason || '');

    const updatedEntry: ActionLogEntry = {
      ...entry,
      status: execResult.success ? 'success' : 'failed',
      triggeredBy: approvedBy === 'system' ? 'system' : 'user',
      result: execResult,
    };
    log[actionIndex] = updatedEntry;

    await pool.query(
      'UPDATE incidents SET action_log = $2 WHERE id = $1',
      [incidentId, JSON.stringify(log)]
    );

    return updatedEntry;
  } catch (err) {
    logger.error({ err, incidentId }, 'Failed to approve remediation action');
    return null;
  }
}
