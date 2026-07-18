import { Router, Request, Response } from 'express';
import pool from '../db/index.js';
import { analyzeIncident, type DiagnosisResult } from '../services/aiDiagnosisService.js';
import { fetchRelatedMetrics } from '../services/incidentMetrics.js';
import { executeRemediation } from '../services/autoRemediationService.js';
import { logger } from '../logger.js';

const router = Router();

// ── GET /incidents — List all incidents ──────────────────────────────────────

router.get('/incidents', async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query('SELECT * FROM incidents ORDER BY triggered_at DESC NULLS LAST');
    res.json({ data: rows, pagination: { page: 1, limit: 20, total: rows.length } });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

// ── GET /incidents/:id — Get incident detail ────────────────────────────────

router.get('/incidents/:id', async (req: Request, res: Response) => {
  try {
    const { rows: [inc] } = await pool.query('SELECT * FROM incidents WHERE id = $1', [req.params.id]);
    if (!inc) return res.status(404).json({ error: { code: 'not_found', message: 'Incident not found' } });
    res.json({ data: inc });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

// ── POST /incidents — Create incident (optionally with auto-analysis) ────────

router.post('/incidents', async (req: Request, res: Response) => {
  try {
    const {
      severity, title, description, detection_type,
      affected_entities, triggered_at,
    } = req.body ?? {};

    if (!severity || !title) {
      return res.status(400).json({ error: { code: 'bad_request', message: 'severity and title are required' } });
    }

    const orgId = req.headers['x-org-id'] as string || 'default';

    const { rows: [inc] } = await pool.query(
      `INSERT INTO incidents (severity, title, description, detection_type, affected_entities, triggered_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        severity,
        title,
        description || null,
        detection_type || 'manual',
        JSON.stringify(affected_entities || {}),
        triggered_at || new Date().toISOString(),
      ]
    );

    // Trigger AI analysis + auto-remediation asynchronously
    triggerAnalysis(inc, orgId).catch((err) =>
      logger.error({ err, incidentId: inc.id }, 'Auto-analysis failed for new incident')
    );

    res.status(201).json({ data: inc });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

// ── PATCH /incidents/:id — Update incident status ────────────────────────────

router.patch('/incidents/:id', async (req: Request, res: Response) => {
  try {
    const { status, mitigated_at, resolved_at } = req.body ?? {};

    const { rows: [existing] } = await pool.query('SELECT * FROM incidents WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'Incident not found' } });

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (status !== undefined) { updates.push(`status = $${idx++}`); values.push(status); }
    if (mitigated_at !== undefined) { updates.push(`mitigated_at = $${idx++}`); values.push(mitigated_at); }
    if (resolved_at !== undefined) { updates.push(`resolved_at = $${idx++}`); values.push(resolved_at); }

    if (updates.length === 0) return res.json({ data: existing });

    values.push(req.params.id);
    const { rows: [inc] } = await pool.query(
      `UPDATE incidents SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, values
    );

    res.json({ data: inc });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

// ── POST /incidents/:id/analyze — Trigger (or retry) AI diagnosis ───────────

router.post('/incidents/:id/analyze', async (req: Request, res: Response) => {
  try {
    const { rows: [inc] } = await pool.query('SELECT * FROM incidents WHERE id = $1', [req.params.id]);
    if (!inc) return res.status(404).json({ error: { code: 'not_found', message: 'Incident not found' } });

    // Respond immediately with "analyzing" status, run analysis in background
    res.status(202).json({ data: { id: inc.id, status: 'analyzing', message: 'AI analysis started' } });

    const result = await runDiagnosis(inc);
    await pool.query(
      'UPDATE incidents SET ai_analysis = $2 WHERE id = $1',
      [inc.id, JSON.stringify(result)]
    );
    logger.info({ incidentId: inc.id }, 'AI analysis completed and saved');
  } catch (err) {
    logger.error({ err, incidentId: req.params.id }, 'AI analysis trigger failed');
    // Response already sent — just log
  }
});

// ── POST /incidents/:id/ask — Conversational follow-up using LLM ────────────

router.post('/incidents/:id/ask', async (req: Request, res: Response) => {
  try {
    const { rows: [inc] } = await pool.query('SELECT * FROM incidents WHERE id = $1', [req.params.id]);
    if (!inc) return res.status(404).json({ error: { code: 'not_found', message: 'Incident not found' } });

    const { question } = req.body ?? {};
    if (!question) {
      return res.status(400).json({ error: { code: 'bad_request', message: 'question is required' } });
    }

    const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8080';
    const DIAGNOSIS_MODEL = process.env.DIAGNOSIS_MODEL || 'llama-3.3-70b-instruct';

    // Build context from the existing incident data and analysis
    const analysisContext = inc.ai_analysis
      ? `## Existing Analysis\n${JSON.stringify(inc.ai_analysis, null, 2)}`
      : '## Existing Analysis\n(No AI analysis available yet.)';

    const messages = [
      {
        role: 'system',
        content: `You are a GPU infrastructure expert helping an engineer debug an incident.
Use the existing analysis as context. Be concise and actionable.
If the question asks about something outside the available data, say so.`,
      },
      {
        role: 'user',
        content: `## Incident
Title: ${inc.title}
Description: ${inc.description || '(none)'}
Severity: ${inc.severity}
Status: ${inc.status}
Affected: ${JSON.stringify(inc.affected_entities || {})}

${analysisContext}

## Question from the engineer
${question}

Please provide a helpful, concise answer.`,
      },
    ];

    // Stream the response back via SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const response = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: DIAGNOSIS_MODEL,
          messages,
          stream: true,
          temperature: 0.3,
          max_tokens: 1024,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        res.write(`data: ${JSON.stringify({ error: `LLM returned ${response.status}: ${errBody}` })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            res.write('data: [DONE]\n\n');
            res.end();
            // Save the conversation
            const chatHistory = inc.conversation_history || [];
            chatHistory.push(
              { timestamp: new Date().toISOString(), role: 'user', content: question },
              { timestamp: new Date().toISOString(), role: 'assistant', content: fullContent },
            );
            await pool.query(
              'UPDATE incidents SET conversation_history = $2 WHERE id = $1',
              [inc.id, JSON.stringify(chatHistory)]
            ).catch((err) => logger.error({ err, incidentId: inc.id }, 'Failed to save conversation'));
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          } catch { /* skip parse errors */ }
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ error: err.message || 'Stream error' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

// ── POST /incidents/:id/actions — Append action to log ───────────────────────

router.post('/incidents/:id/actions', async (req: Request, res: Response) => {
  try {
    const { rows: [existing] } = await pool.query('SELECT * FROM incidents WHERE id = $1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: { code: 'not_found', message: 'Incident not found' } });

    const action = {
      timestamp: new Date().toISOString(),
      user_id: req.body?.user_id ?? 'system',
      action: req.body?.action ?? '',
      result: req.body?.result ?? '',
    };

    const actionLog = existing.action_log || [];
    actionLog.push(action);

    await pool.query('UPDATE incidents SET action_log = $2 WHERE id = $1', [req.params.id, JSON.stringify(actionLog)]);

    res.status(201).json({ data: action });
  } catch (err) {
    res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
  }
});

// ── Shared helpers ──────────────────────────────────────────────────────────

/**
 * Run AI diagnosis on an incident: fetch metrics, call LLM, return result.
 */
async function runDiagnosis(inc: any): Promise<DiagnosisResult> {
  const entities = inc.affected_entities || {};
  const metrics = await fetchRelatedMetrics({
    nodeId: entities.node_id || entities.nodeId,
    windowMinutes: 30,
  });

  const result = await analyzeIncident({
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

  return result;
}

/**
 * Trigger AI analysis asynchronously. Called after incident creation.
 * Safe to fire-and-forget (errors are logged, not thrown).
 */
async function triggerAnalysis(inc: any, orgId?: string): Promise<void> {
  try {
    const result = await runDiagnosis(inc);
    await pool.query(
      'UPDATE incidents SET ai_analysis = $2 WHERE id = $1',
      [inc.id, JSON.stringify(result)]
    );
    logger.info({ incidentId: inc.id, topCause: result.root_causes?.[0]?.cause }, 'Auto-analysis saved');

    // Auto-execute Tier 1 remediation actions
    if (orgId && result.recommendations && result.recommendations.length > 0) {
      const remediation = await executeRemediation(inc.id, orgId, result);
      if (remediation.executed.length > 0) {
        logger.info({
          incidentId: inc.id,
          executed: remediation.executed.length,
          needsApproval: remediation.needsApproval.length,
        }, 'Auto-remediation completed');
      }
    }
  } catch (err) {
    logger.error({ err, incidentId: inc.id }, 'Auto-analysis failed');
  }
}

export default router;
