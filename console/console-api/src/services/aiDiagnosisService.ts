/**
 * AI Diagnosis Service
 *
 * Analyzes GPU incidents using Ultralisk's own inference engine.
 * Calls POST /v1/chat/completions (non-streaming, json_object mode)
 * with a structured system prompt that encodes the GPU fault diagnosis
 * framework. Returns a DiagnosisResult that gets stored in
 * incidents.ai_analysis.
 *
 * The LLM runs on the same platform it diagnoses — this is both a
 * functional feature and a trust signal for customers.
 */

import { logger } from '../logger.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RootCause {
  cause: string;
  confidence: number; // 0–1
  evidence: string;
}

export interface Recommendation {
  action: string;
  risk: 'low' | 'medium' | 'high';
  tier: 1 | 2 | 3;
}

export interface DiagnosisResult {
  model_used: string;
  analyzed_at: string;
  root_causes: RootCause[];
  recommendations: Recommendation[];
  summary: string;
}

export interface DiagnosisInput {
  incidentId: string;
  title: string;
  description: string;
  severity: string;
  affectedEntities: {
    clusterId?: string;
    nodeId?: string;
    modelId?: string;
    endpointId?: string;
  };
  metrics: {
    utilizationPct: number[];
    memoryUsedMb: number[];
    temperature: number[];
    timestamps: string[];
  };
}

// ── Configuration ───────────────────────────────────────────────────────────

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8080';
const DIAGNOSIS_MODEL = process.env.DIAGNOSIS_MODEL || 'llama-3.3-70b-instruct';
const DIAGNOSIS_TIMEOUT_MS = Number(process.env.DIAGNOSIS_TIMEOUT_MS) || 30_000;

// ── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are an expert GPU infrastructure engineer analyzing a production incident.

Your task is to diagnose the root cause of a GPU-related incident and recommend remediation steps.

## Diagnosis Framework

Analyze the incident using these categories, in priority order:

1. **OOM / Out of Memory** — GPU memory exhausted, worker OOM-killed (SIGKILL exit code 137)
   - Evidence pattern: memory usage spike → 100%, followed by utilization drop to 0
2. **GPU Hang / Xid Error** — GPU hung or encountered a hardware error (Xid 13, 48, 63, 109)
   - Evidence pattern: utilization drops to 0, temperature stays elevated
3. **Thermal Throttling** — GPU temperature exceeded threshold
   - Evidence pattern: gradual performance degradation, temperature > 85°C
4. **Model Loading Failure** — Failed to load model weights or build CUDA graph
   - Evidence pattern: utilization and memory both near zero after deployment
5. **Network / NCCL Timeout** — Multi-node communication failure
   - Evidence pattern: works fine on single GPU, fails on multi-GPU
6. **Driver / CUDA Version Mismatch** — incompatible driver version
   - Evidence pattern: all GPUs on node show same "unexpected" behavior
7. **Unknown / Other** — no clear pattern matching known categories

## Output Format

You MUST respond with valid JSON only (no markdown, no code fences):

{
  "root_causes": [
    {
      "cause": "short description of root cause",
      "confidence": 0.0-1.0,
      "evidence": "specific metrics or observations supporting this cause"
    }
  ],
  "recommendations": [
    {
      "action": "specific action to take",
      "risk": "low" | "medium" | "high",
      "tier": 1 | 2 | 3
    }
  ],
  "summary": "one-sentence TL;DR of the incident"
}

Tier definitions:
- Tier 1: Low risk, can be fully automated (e.g., restart worker, clear cache)
- Tier 2: Medium risk, needs human approval (e.g., scale up, switch model)
- Tier 3: High risk, human must execute (e.g., reboot node, rollback driver)

If you cannot determine the root cause with confidence > 0.3, set confidence to 0 and explain what additional data would help.`;
}

function buildUserPrompt(input: DiagnosisInput): string {
  return `## Incident
Title: ${input.title}
Description: ${input.description || '(none)'}
Severity: ${input.severity}
Affected: ${JSON.stringify(input.affectedEntities)}

## GPU Metrics (last ${input.metrics.utilizationPct.length} data points)
Timestamps: ${input.metrics.timestamps.join(', ')}
GPU Utilization (%): ${input.metrics.utilizationPct.join(', ')}
Memory Used (MB): ${input.metrics.memoryUsedMb.join(', ')}
Temperature (°C): ${input.metrics.temperature.join(', ')}

Analyze the above and output a JSON diagnosis.`;
}

// ── LLM invoker ──────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Call the internal inference endpoint for diagnosis.
 * Uses the same Gateway as production inference requests.
 */
async function callDiagnosisLLM(messages: ChatMessage[]): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DIAGNOSIS_TIMEOUT_MS);

  try {
    const response = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: DIAGNOSIS_MODEL,
        messages,
        stream: false,
        temperature: 0.1, // low temperature for deterministic analysis
        max_tokens: 2048,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`LLM returned ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content || '';
    if (!content) throw new Error('LLM returned empty response');
    return content;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Diagnosis LLM timed out after ${DIAGNOSIS_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse the LLM response into a structured DiagnosisResult.
 * Handles edge cases where the LLM returns malformed JSON or omits fields.
 */
function parseDiagnosis(raw: string): DiagnosisResult {
  // Try to extract JSON from the response (handle markdown fences etc.)
  let jsonStr = raw.trim();
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) jsonStr = jsonMatch[0];

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Fallback: generate a minimal valid result
    logger.warn({ raw: raw.slice(0, 200) }, 'Failed to parse diagnosis LLM output as JSON');
    return {
      model_used: DIAGNOSIS_MODEL,
      analyzed_at: new Date().toISOString(),
      root_causes: [{ cause: 'Analysis failed — LLM output was not valid JSON', confidence: 0, evidence: raw.slice(0, 500) }],
      recommendations: [{ action: 'Review raw LLM output and diagnose manually', risk: 'medium', tier: 3 }],
      summary: 'AI analysis failed to produce structured output.',
    };
  }

  // Validate and normalize root_causes
  const rootCauses: RootCause[] = (parsed.root_causes || []).map((rc: any, i: number) => ({
    cause: String(rc.cause || `Root cause #${i + 1}`),
    confidence: Math.min(1, Math.max(0, Number(rc.confidence) || 0)),
    evidence: String(rc.evidence || ''),
  }));

  // Validate and normalize recommendations
  const recommendations: Recommendation[] = (parsed.recommendations || []).map((rec: any, i: number) => ({
    action: String(rec.action || `Recommendation #${i + 1}`),
    risk: ['low', 'medium', 'high'].includes(rec.risk) ? rec.risk : 'medium',
    tier: [1, 2, 3].includes(Number(rec.tier)) ? Number(rec.tier) as 1 | 2 | 3 : 2,
  }));

  if (rootCauses.length === 0) {
    rootCauses.push({ cause: 'No root cause identified', confidence: 0, evidence: 'Analysis completed but no clear root cause found.' });
  }

  return {
    model_used: DIAGNOSIS_MODEL,
    analyzed_at: new Date().toISOString(),
    root_causes: rootCauses,
    recommendations: recommendations,
    summary: String(parsed.summary || rootCauses[0]?.cause || 'Incident analyzed.'),
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyze an incident using the internal LLM.
 *
 * @returns Structured DiagnosisResult ready to store in incidents.ai_analysis.
 *          In case of failure, returns a fallback diagnosis with confidence 0.
 */
export async function analyzeIncident(input: DiagnosisInput): Promise<DiagnosisResult> {
  const startTime = Date.now();
  logger.info({ incidentId: input.incidentId, model: DIAGNOSIS_MODEL }, 'Starting AI diagnosis');

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(input) },
    ];

    const raw = await callDiagnosisLLM(messages);
    const result = parseDiagnosis(raw);
    const elapsed = Date.now() - startTime;

    logger.info({
      incidentId: input.incidentId,
      elapsedMs: elapsed,
      rootCauseCount: result.root_causes.length,
      topConfidence: result.root_causes[0]?.confidence,
      model: result.model_used,
    }, 'AI diagnosis completed');

    return result;
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    logger.error({ err, incidentId: input.incidentId, elapsedMs: elapsed }, 'AI diagnosis failed');

    // Return a fallback diagnosis so the incident flow is never blocked
    return {
      model_used: DIAGNOSIS_MODEL,
      analyzed_at: new Date().toISOString(),
      root_causes: [{
        cause: `AI analysis unavailable: ${err.message || 'unknown error'}`,
        confidence: 0,
        evidence: 'The diagnosis service was unable to complete analysis. Check the incident logs for details.',
      }],
      recommendations: [{ action: 'Review incident manually in the console', risk: 'medium', tier: 3 }],
      summary: 'AI diagnosis unavailable due to a service error.',
    };
  }
}
