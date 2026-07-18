/**
 * Webhook receivers for external systems.
 *
 * POST /v1/admin/webhooks/prometheus/alert
 *   — Receives Alertmanager webhook callbacks
 *   — Creates/updates incidents via IncidentEngine
 */

import { Router, Request, Response } from 'express';
import { handleAlertWebhook, type AlertmanagerWebhook } from '../services/incidentEngine.js';
import { logger } from '../logger.js';

const router = Router();

/**
 * Prometheus Alertmanager webhook receiver.
 *
 * Alertmanager webhook configuration:
 * ```yaml
 * receivers:
 *   - name: ultralisk
 *     webhook_configs:
 *       - url: https://console.ultralisk.ai/v1/admin/webhooks/prometheus/alert
 *         send_resolved: true
 * ```
 */
router.post('/webhooks/prometheus/alert', async (req: Request, res: Response) => {
  try {
    const webhook = req.body as AlertmanagerWebhook;

    if (!webhook || !webhook.alerts || !Array.isArray(webhook.alerts)) {
      return res.status(400).json({ error: { code: 'bad_request', message: 'Invalid Alertmanager webhook payload' } });
    }

    logger.info({
      alertCount: webhook.alerts.length,
      status: webhook.status,
      receiver: webhook.receiver,
    }, 'Received Alertmanager webhook');

    const result = await handleAlertWebhook(webhook);

    res.status(200).json({
      data: {
        incidents_created: result.created,
        incidents_updated: result.updated,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Alertmanager webhook handler failed');
    res.status(500).json({ error: { code: 'internal_error', message: 'Webhook handler failed' } });
  }
});

export default router;
