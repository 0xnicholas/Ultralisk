/**
 * Slack Bot Service — Bidirectional ChatOps via Socket Mode
 *
 * Provides:
 *  - Socket Mode connection for slash commands + interactive buttons
 *  - /ultralisk incident <id> — query incident detail + AI analysis
 *  - /ultralisk ask <incident_id> <question> — follow-up question via SSE
 *  - Block Kit push notifications for new incidents
 *  - Interactive "Approve Remediation" / "Dismiss" buttons
 *
 * Phase 2 scope: single workspace, two slash commands, incident-scoped chat.
 * General-purpose chat (without incident context) is not in scope.
 */

import { logger } from '../logger.js';
import pool from '../db/index.js';
import { approveAction } from './autoRemediationService.js';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SlackIntegration {
  bot_token: string | null;
  app_token: string | null;
  app_id: string | null;
  incident_channel: string | null;
  workspace_name: string | null;
}

interface SlackCommandPayload {
  command: string;
  text: string;
  channel_id: string;
  user_id: string;
  response_url: string;
  trigger_id: string;
}

interface SlackBlockActionPayload {
  actions: Array<{ action_id: string; value: string }>;
  channel: { id: string };
  user: { id: string };
  message: { ts: string };
}

// ── State ──────────────────────────────────────────────────────────────────────

let socketModeClient: any = null;
let webClient: any = null;
let isRunning = false;

// ── Initialization ─────────────────────────────────────────────────────────────

/**
 * Start the Slack bot if the org has a connected Slack integration
 * with Socket Mode credentials.
 */
export async function startSlackBot(): Promise<void> {
  if (isRunning) return;

  try {
    const config = await loadSlackConfig();
    if (!config || !config.bot_token || !config.app_token) {
      logger.info('Slack bot: bot_token or app_token not configured, skipping');
      return;
    }

    // Dynamic import to avoid requiring these packages at boot when Slack isn't configured.
    // These packages are optional — install with `pnpm add @slack/web-api @slack/socket-mode` to enable Slack ChatOps.
    const { WebClient } = await import('@slack/web-api');
    const { SocketModeClient } = await import('@slack/socket-mode');

    webClient = new WebClient(config.bot_token);
    socketModeClient = new SocketModeClient({ appToken: config.app_token });

    setupSlashCommandHandler(socketModeClient, config);
    setupInteractiveHandler(socketModeClient);

    await socketModeClient.start();
    isRunning = true;
    logger.info({ workspace: config.workspace_name }, 'Slack bot: Socket Mode connected');
  } catch (err: any) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.message?.includes('Cannot find module')) {
      logger.warn('Slack bot: @slack/web-api or @slack/socket-mode not installed, skipping');
    } else {
      logger.error({ err }, 'Slack bot: failed to start');
    }
  }
}

/**
 * Stop the Slack bot connection. Graceful shutdown hook.
 */
export async function stopSlackBot(): Promise<void> {
  if (socketModeClient) {
    try {
      await socketModeClient.disconnect();
    } catch (err) {
      logger.error({ err }, 'Slack bot: error during disconnect');
    }
  }
  socketModeClient = null;
  webClient = null;
  isRunning = false;
}

// ── Config loader ─────────────────────────────────────────────────────────────

async function loadSlackConfig(): Promise<SlackIntegration | null> {
  try {
    const { rows } = await pool.query(
      'SELECT bot_token, app_token, app_id, incident_channel, workspace_name FROM slack_integrations WHERE connected = true LIMIT 1'
    );
    if (!rows[0]) return null;
    return rows[0] as SlackIntegration;
  } catch (err) {
    logger.error({ err }, 'Slack bot: failed to load config');
    return null;
  }
}

// ── Slash command handler ─────────────────────────────────────────────────────

function setupSlashCommandHandler(client: any, config: SlackIntegration): void {
  client.on('slash_commands', async ({ body, ack }: { body: SlackCommandPayload; ack: (arg: unknown) => Promise<void> }) => {
    try {
      const { command, text } = body;
      if (command === '/ultralisk') {
        await handleUltraliskSlash(text, body, config);
        await ack({});
      } else {
        await ack({ text: `Unknown command: ${command}` });
      }
    } catch (err: any) {
      logger.error({ err, command: body.command }, 'Slack bot: slash command error');
      await ack({ text: 'An error occurred processing your command.' });
    }
  });
}

async function handleUltraliskSlash(text: string, payload: SlackCommandPayload, config: SlackIntegration): Promise<void> {
  const parts = text.trim().split(/\s+/);
  const sub = parts[0]?.toLowerCase();

  if (sub === 'incident' && parts[1]) {
    await handleIncidentCommand(parts[1], config);
  } else if (sub === 'ask' && parts[1]) {
    const incidentId = parts[1];
    const question = parts.slice(2).join(' ');
    if (!question) {
      await webClient.chat.postEphemeral({ channel: payload.channel_id, user: payload.user_id, text: 'Usage: `/ultralisk ask <incident_id> <question>`' });
      return;
    }
    await handleAskCommand(incidentId, question, config);
  } else {
    const help = ':robot_face: *Ultralisk AIOps*\n• `/ultralisk incident <id>` — View incident details and AI diagnosis\n• `/ultralisk ask <incident_id> <question>` — Ask a follow-up question';
    await webClient.chat.postEphemeral({ channel: payload.channel_id, user: payload.user_id, text: help });
  }
}

async function handleIncidentCommand(incidentId: string, config: SlackIntegration): Promise<void> {
  if (!webClient) return;
  try {
    const { rows } = await pool.query('SELECT * FROM incidents WHERE id = $1', [incidentId]);
    const inc = rows[0];
    if (!inc) {
      if (config.incident_channel) {
        await webClient.chat.postMessage({ channel: config.incident_channel, text: `:warning: Incident \`${incidentId}\` not found.` });
      }
      return;
    }
    const blocks = buildIncidentCard(inc);
    const channel = config.incident_channel;
    if (!channel) return;
    await webClient.chat.postMessage({ channel, blocks, text: `Incident ${incidentId}: ${inc.severity} — ${inc.title}` });
  } catch (err) {
    logger.error({ err, incidentId }, 'Slack bot: incident command failed');
  }
}

async function handleAskCommand(incidentId: string, question: string, config: SlackIntegration): Promise<void> {
  if (!webClient) return;
  const channel = config.incident_channel;
  if (!channel) return;

  try {
    const CONSOLE_URL = process.env.CONSOLE_URL || 'http://localhost:3100';
    const resp = await fetch(`${CONSOLE_URL}/v1/admin/incidents/${encodeURIComponent(incidentId)}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    if (!resp.ok) {
      await webClient.chat.postMessage({ channel, text: `:warning: Failed to query incident \`${incidentId}\`: ${resp.status}` });
      return;
    }

    // Read the SSE stream and collect deltas
    const reader = resp.body?.getReader();
    if (!reader) {
      await webClient.chat.postMessage({ channel, text: 'No response stream available.' });
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullAnswer = '';
    const initialMsg = await webClient.chat.postMessage({ channel, text: ':hourglass_flowing_sand: Analyzing...' });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const dataStr = line.slice(6).trim();
        if (dataStr === '[DONE]') break;
        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.content) {
            fullAnswer += parsed.content;
          }
        } catch {
          if (dataStr.length > 5) logger.warn({ dataStr: dataStr.slice(0, 200) }, 'Slack bot: unparseable SSE chunk');
        }
      }
    }

    await webClient.chat.update({
      channel,
      ts: initialMsg.ts,
      text: fullAnswer || '(no response)',
    });
  } catch (err) {
    logger.error({ err, incidentId }, 'Slack bot: ask command failed');
  }
}

// ── Interactive handler ───────────────────────────────────────────────────────

function setupInteractiveHandler(client: any): void {
  client.on('interactive', async ({ body, ack }: { body: SlackBlockActionPayload; ack: (arg: unknown) => Promise<void> }) => {
    try {
      await ack({});
      for (const action of body.actions) {
        const [verb, incidentId, actionIndex] = action.value.split(':');
        if (verb === 'approve') {
          await handleApproveRemediation(incidentId, parseInt(actionIndex, 10), body.user.id);
        } else if (verb === 'dismiss') {
          await handleDismissRemediation(incidentId, body.channel.id, body.message.ts);
        }
      }
    } catch (err) {
      logger.error({ err }, 'Slack bot: interactive handler error');
    }
  });
}

async function handleApproveRemediation(incidentId: string, actionIndex: number, userId: string): Promise<void> {
  try {
    await approveAction(incidentId, actionIndex, userId);
    logger.info({ incidentId, actionIndex, userId }, 'Slack bot: remediation approved via interactive button');
  } catch (err) {
    logger.error({ err, incidentId }, 'Slack bot: approve remediation failed');
  }
}

async function handleDismissRemediation(incidentId: string, channelId: string, messageTs: string): Promise<void> {
  if (!webClient) return;
  try {
    // Update the message to show dismissal
    await webClient.chat.update({
      channel: channelId,
      ts: messageTs,
      text: 'Incident notification dismissed.',
      blocks: [],
    });
    logger.info({ incidentId }, 'Slack bot: incident notification dismissed');
  } catch (err) {
    logger.error({ err, incidentId }, 'Slack bot: dismiss failed');
  }
}

// ── Push notification ────────────────────────────────────────────────────────

export async function pushIncidentToSlack(inc: any): Promise<void> {
  try {
    const config = await loadSlackConfig();
    if (!config || !config.incident_channel || !webClient) return;

    const blocks = buildIncidentCard(inc);
    await webClient.chat.postMessage({
      channel: config.incident_channel,
      blocks,
      text: `${inc.severity.toUpperCase()} Incident: ${inc.title}`,
    });
    logger.info({ incidentId: inc.id }, 'Slack bot: incident pushed to channel');
  } catch (err) {
    logger.error({ err, incidentId: inc.id }, 'Slack bot: push incident failed');
  }
}

// ── Block Kit builders ────────────────────────────────────────────────────────

function buildIncidentCard(inc: any): any[] {
  const severityEmoji: Record<string, string> = { critical: ':red_circle:', warning: ':yellow_circle:', info: ':blue_circle:' };
  const emoji = severityEmoji[inc.severity] || ':grey_question:';
  const analysis = inc.ai_analysis || {};
  const topCause = analysis.root_causes?.[0];
  const recommendations = analysis.recommendations || [];
  const hasPending = inc.action_log?.some((entry: any) => entry.status === 'pending');

  const blocks: any[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${emoji} ${inc.severity.toUpperCase()}: ${inc.title}`, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Status:* ${inc.status}` },
        { type: 'mrkdwn', text: `*Triggered:* ${inc.triggered_at ? new Date(inc.triggered_at).toLocaleString() : 'N/A'}` },
      ],
    },
  ];

  if (inc.description) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: inc.description },
    });
  }

  if (topCause) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Root Cause* (${Math.round(topCause.confidence * 100)}% confidence):\n${topCause.cause}\n_${topCause.evidence}_`,
      },
    });
  }

  if (recommendations.length > 0) {
    const recText = recommendations.slice(0, 3).map((r: any, i: number) => `${i + 1}. ${r.action} (risk: ${r.risk})`).join('\n');
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Recommendations:*\n${recText}` },
    });
  }

  if (hasPending) {
    const pendingActions = inc.action_log
      .map((entry: any, originalIndex: number) => ({ entry, originalIndex }))
      .filter(({ entry }: { entry: any }) => entry.status === 'pending')
      .map(({ entry, originalIndex }: { entry: any; originalIndex: number }) => ({
        type: 'button' as const,
        text: { type: 'plain_text' as const, text: `Approve: ${entry.action.split('.').pop()}`.slice(0, 75), emoji: true },
        value: `approve:${inc.id}:${originalIndex}`,
        action_id: `approve_${originalIndex}`,
      }));

    blocks.push({
      type: 'actions',
      elements: [
        ...pendingActions.slice(0, 2),
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Dismiss', emoji: true },
          value: `dismiss:${inc.id}`,
          action_id: 'dismiss',
          style: 'danger',
        },
      ],
    });
  }

  return blocks;
}
