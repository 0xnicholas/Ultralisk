/**
 * Budget alert notification service.
 *
 * Supports email (SMTP via env vars) and Slack (webhook URL from
 * slack_integrations table) channels. In dev mode, notifications are
 * logged to the console rather than sent.
 */

import pool from '../db/index.js';
import { logger } from '../logger.js';
import { DEFAULT_BUDGET_USD, DEFAULT_ALERT_THRESHOLDS } from '../constants.js';
import type { ThresholdConfig } from '../constants.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface BudgetAlertSettings {
  orgId: string;
  budgetUsd: number;
  alertsEnabled: boolean;
  channels: string[];
  suppressionWindowMinutes: number;
  thresholds: ThresholdConfig[];
}

export interface AlertContext {
  orgId: string;
  threshold: ThresholdConfig;
  currentSpend: number;
  budgetUsd: number;
}

// ── Settings loader ───────────────────────────────────────────────────────────

export async function getBudgetAlertSettings(orgId: string): Promise<BudgetAlertSettings | null> {
  const { rows } = await pool.query(
    'SELECT * FROM budget_alert_settings WHERE org_id = $1',
    [orgId]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    orgId: r.org_id,
    budgetUsd: Number(r.budget_usd) || DEFAULT_BUDGET_USD,
    alertsEnabled: r.alerts_enabled,
    channels: r.channels || ['email'],
    suppressionWindowMinutes: r.suppression_window_minutes || 30,
    thresholds: r.thresholds || DEFAULT_ALERT_THRESHOLDS,
  };
}

// ── Suppression check ─────────────────────────────────────────────────────────

/**
 * Returns true if a notification for this org+threshold was already sent
 * within the suppression window.
 */
export async function wasRecentlyNotified(
  orgId: string, thresholdLabel: string, windowMinutes: number
): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM budget_alert_notifications
     WHERE org_id = $1 AND threshold_label = $2
       AND sent_at > NOW() - ($3 || ' minutes')::INTERVAL
     LIMIT 1`,
    [orgId, thresholdLabel, windowMinutes]
  );
  return rows.length > 0;
}

// ── Notification logging ──────────────────────────────────────────────────────

export async function logNotification(
  orgId: string, threshold: ThresholdConfig, channel: string, currentSpend: number
): Promise<void> {
  await pool.query(
    `INSERT INTO budget_alert_notifications
     (org_id, threshold_label, threshold_type, threshold_value, channel, current_spend)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [orgId, threshold.label, threshold.type, threshold.value, channel, currentSpend]
  );
}

// ── Channel dispatchers ───────────────────────────────────────────────────────

const IS_PROD = process.env.NODE_ENV === 'production';

export async function sendEmail(
  to: string, subject: string, body: string
): Promise<void> {
  if (!IS_PROD) {
    logger.info({ to, subject }, '[dev] email notification skipped (logged)');
    return;
  }
  // Production: use SMTP env vars
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || 'alerts@ultralisk.ai';

  if (!host || !user || !pass) {
    logger.warn({ to, subject }, 'SMTP not configured; email not sent');
    return;
  }

  try {
    // Dynamically import nodemailer (not a hard dependency; may not be installed).
    let nodemailer: any;
    try {
      // @ts-expect-error -- optional dependency, catch handles missing module.
      nodemailer = await import('nodemailer');
    } catch {
      logger.warn({ to, subject }, 'nodemailer not installed; falling back to console');
      return;
    }
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await transporter.sendMail({ from, to, subject, text: body });
    logger.info({ to, subject }, 'budget alert email sent');
  } catch (err) {
    logger.error({ err, to, subject }, 'failed to send budget alert email');
  }
}

export async function sendSlack(
  webhookUrl: string, message: string
): Promise<void> {
  if (!IS_PROD) {
    logger.info({ webhookUrl }, '[dev] Slack notification skipped (logged)');
    return;
  }
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
    if (!response.ok) {
      logger.warn({ status: response.status, webhookUrl }, 'Slack webhook returned non-200');
    }
  } catch (err) {
    logger.error({ err, webhookUrl }, 'failed to send Slack notification');
  }
}

// ── Build notification content ────────────────────────────────────────────────

function buildAlertSubject(ctx: AlertContext): string {
  const pct = Math.round((ctx.currentSpend / ctx.budgetUsd) * 100);
  return `[Ultralisk] Budget Alert: ${ctx.threshold.label} — ${pct}% of $${ctx.budgetUsd.toLocaleString()} budget used`;
}

function buildAlertBody(ctx: AlertContext): string {
  const pct = Math.round((ctx.currentSpend / ctx.budgetUsd) * 100);
  return [
    `Ultralisk Budget Alert`,
    `──────────────────────`,
    ``,
    `Threshold: ${ctx.threshold.label}`,
    `Current spend: $${ctx.currentSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Budget: $${ctx.budgetUsd.toLocaleString()}`,
    `Usage: ${pct}%`,
    ``,
    ctx.threshold.type === 'percent'
      ? `You've used ${pct}% of your $${ctx.budgetUsd.toLocaleString()} monthly budget.`
      : `GPU utilization has exceeded ${ctx.threshold.value}%.`,
    ``,
    `View details: https://console.ultralisk.ai/cost-analytics`,
  ].join('\n');
}

// ── Main dispatch ─────────────────────────────────────────────────────────────

/**
 * Evaluate and send budget alerts for a single org.
 * Called by the budget alert cron.
 */
export async function checkAndSendBudgetAlerts(orgId: string): Promise<void> {
  const settings = await getBudgetAlertSettings(orgId);
  if (!settings || !settings.alertsEnabled) return;

  // Calculate current spend (same logic as costAnalytics route)
  const { rows } = await pool.query(`
    SELECT COALESCE(SUM(cost_usd), 0) AS total_cost_usd
    FROM cost_data
    WHERE org_id = $1 AND recorded_at > NOW() - INTERVAL '30 days'
  `, [orgId]);
  const currentSpend = Number(rows[0]?.total_cost_usd || 0);
  const pctUsed = (currentSpend / settings.budgetUsd) * 100;

  for (const threshold of settings.thresholds) {
    let triggered = false;

    if (threshold.type === 'percent') {
      triggered = pctUsed >= threshold.value;
    } else if (threshold.type === 'gpu_util') {
      // Check average GPU utilization from metric snapshots
      const { rows: gpuRows } = await pool.query(`
        SELECT COALESCE(AVG(utilization_pct), 0) AS avg_util
        FROM gpu_metric_snapshots
        WHERE timestamp > NOW() - INTERVAL '1 hour'
      `);
      triggered = Number(gpuRows[0]?.avg_util || 0) >= threshold.value;
    }

    if (!triggered) continue;

    // Check suppression window
    const notified = await wasRecentlyNotified(
      orgId, threshold.label, settings.suppressionWindowMinutes
    );
    if (notified) continue;

    const ctx: AlertContext = { orgId, threshold, currentSpend, budgetUsd: settings.budgetUsd };
    const subject = buildAlertSubject(ctx);
    const body = buildAlertBody(ctx);

    // Send via each configured channel
    for (const channel of settings.channels) {
      if (channel === 'email') {
        // Find org admin emails (simplified: use a default)
        const { rows: orgAdminRows } = await pool.query(
          `SELECT u.email FROM members m JOIN users u ON u.id = m.user_id
           WHERE m.org_id = $1 AND m.role IN ('owner', 'admin')`,
          [orgId]
        );
        const emails = orgAdminRows.map((r: any) => r.email);
        if (emails.length > 0) {
          for (const email of emails) {
            await sendEmail(email, subject, body);
          }
        }
        await logNotification(orgId, threshold, 'email', currentSpend);
      }

      if (channel === 'slack') {
        const { rows: slackRows } = await pool.query(
          'SELECT webhook_url FROM slack_integrations WHERE org_id = $1 AND connected = true AND webhook_url IS NOT NULL',
          [orgId]
        );
        if (slackRows.length > 0) {
          await sendSlack(slackRows[0].webhook_url, body);
        }
        await logNotification(orgId, threshold, 'slack', currentSpend);
      }
    }
  }
}

// ── Startup dependency check ───────────────────────────────────────────────────

/**
 * Check that optional notification dependencies are available.
 * Called once at boot from index.ts. Logs a warning in production
 * when nodemailer is not installed and SMTP is configured.
 */
export async function checkNotificationDependencies(): Promise<void> {
  if (!IS_PROD) return;
  if (!process.env.SMTP_HOST) return; // SMTP not configured, no dependency needed

  try {
    // @ts-expect-error -- optional dependency, catch handles missing module.
    await import('nodemailer');
    logger.info('nodemailer available for email notifications');
  } catch {
    logger.warn(
      'nodemailer is not installed. Email notifications will fall back to logging. ' +
      'Run: npm install nodemailer'
    );
  }
}
