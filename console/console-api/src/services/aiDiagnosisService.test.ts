import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import after mocks
import { analyzeIncident, type DiagnosisInput } from './aiDiagnosisService.js';

beforeEach(() => {
  mockFetch.mockReset();
  // Set env vars before each test — module-level constants are evaluated
  // at import time, but the LLM caller uses process.env at call time for
  // GATEWAY_URL. DIAGNOSIS_MODEL is fixed at import, so tests check the
  // production default.
  process.env.GATEWAY_URL = 'http://localhost:8080';
  process.env.DIAGNOSIS_TIMEOUT_MS = '5000';
});

const sampleInput: DiagnosisInput = {
  incidentId: 'inc_001',
  title: 'GPU utilization dropped to near zero',
  description: 'Node gpu-n12 GPU-3 utilization dropped from 92% to 2% at 14:23 UTC',
  severity: 'critical',
  affectedEntities: { nodeId: 'node-123', clusterId: 'cluster-a' },
  metrics: {
    utilizationPct: [65, 72, 88, 95, 3, 2, 1],
    memoryUsedMb: [45000, 52000, 68000, 78000, 5000, 3000, 2000],
    temperature: [58, 62, 71, 82, 68, 60, 55],
    timestamps: ['14:20', '14:21', '14:22', '14:23', '14:24', '14:25', '14:26'],
  },
};

function mockLLMResponse(body: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(body) } }],
    }),
  });
}

function mockLLMFailure() {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 503,
    text: async () => 'Model overloaded',
  });
}

function mockLLMTimeout() {
  mockFetch.mockRejectedValueOnce(new DOMException('The operation was aborted', 'AbortError'));
}

describe('analyzeIncident', () => {
  it('returns parsed diagnosis result from LLM', async () => {
    mockLLMResponse({
      root_causes: [
        { cause: 'GPU OOM: process exited with SIGKILL (exit code 137)', confidence: 0.92, evidence: 'Memory spike to 78GB on 80GB H100 followed by utilization drop to 3%.' },
      ],
      recommendations: [
        { action: 'Restart vLLM worker on node gpu-n12', risk: 'low', tier: 1 },
        { action: 'Reduce batch size or increase GPU count for this model', risk: 'medium', tier: 2 },
      ],
      summary: 'GPU OOM killed the vLLM worker, causing utilization to drop to near zero.',
    });

    const result = await analyzeIncident(sampleInput);
    expect(result.model_used).toBe('llama-3.3-70b-instruct');
    expect(result.root_causes).toHaveLength(1);
    expect(result.root_causes[0].confidence).toBe(0.92);
    expect(result.root_causes[0].cause).toContain('SIGKILL');
    expect(result.recommendations).toHaveLength(2);
    expect(result.recommendations[0].tier).toBe(1);
    expect(result.summary).toBeTruthy();
    expect(result.analyzed_at).toBeTruthy();

    // Verify the LLM was called with correct parameters
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toContain('/v1/chat/completions');
    const body = JSON.parse(callArgs[1].body);
    expect(body.response_format?.type).toBe('json_object');
    expect(body.temperature).toBe(0.1);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].role).toBe('user');
  });

  it('validates multiple root causes', async () => {
    mockLLMResponse({
      root_causes: [
        { cause: 'Thermal throttling detected', confidence: 0.75, evidence: 'Temperature reached 85°C' },
        { cause: 'Power capping active', confidence: 0.45, evidence: 'Power limit set to 70%' },
      ],
      recommendations: [{ action: 'Check cooling system', risk: 'medium', tier: 2 }],
      summary: 'GPU throttling likely due to thermal limits.',
    });

    const result = await analyzeIncident(sampleInput);
    expect(result.root_causes).toHaveLength(2);
    expect(result.root_causes[0].confidence).toBe(0.75);
    expect(result.root_causes[1].confidence).toBe(0.45);
  });

  it('returns fallback on LLM HTTP failure', async () => {
    mockLLMFailure();
    const result = await analyzeIncident(sampleInput);
    expect(result.root_causes).toHaveLength(1);
    expect(result.root_causes[0].confidence).toBe(0);
    expect(result.root_causes[0].cause).toContain('unavailable');
    expect(result.recommendations[0].tier).toBe(3);
  });

  it('returns fallback on LLM timeout', async () => {
    mockLLMTimeout();
    const result = await analyzeIncident(sampleInput);
    expect(result.root_causes).toHaveLength(1);
    expect(result.root_causes[0].confidence).toBe(0);
    expect(result.root_causes[0].cause).toContain('timed out');
  });

  it('parses malformed LLM output gracefully', async () => {
    // LLM returns non-JSON
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'I cannot analyze this incident because...' } }],
      }),
    });

    const result = await analyzeIncident(sampleInput);
    expect(result.root_causes).toHaveLength(1);
    expect(result.root_causes[0].confidence).toBe(0);
    expect(result.root_causes[0].cause).toContain('not valid JSON');
  });

  it('handles LLM returning empty root_causes', async () => {
    mockLLMResponse({
      recommendations: [{ action: 'Check logs', risk: 'low', tier: 2 }],
      summary: 'No root cause identified.',
    });

    const result = await analyzeIncident(sampleInput);
    expect(result.root_causes).toHaveLength(1);
    expect(result.root_causes[0].cause).toBe('No root cause identified');
    expect(result.root_causes[0].confidence).toBe(0);
  });

  it('clamps confidence to 0–1 range', async () => {
    mockLLMResponse({
      root_causes: [
        { cause: 'Test cause', confidence: 999, evidence: 'Out of range' },
        { cause: 'Negative', confidence: -5, evidence: 'Below zero' },
      ],
      recommendations: [],
      summary: 'Edge case test.',
    });

    const result = await analyzeIncident(sampleInput);
    expect(result.root_causes[0].confidence).toBe(1);
    expect(result.root_causes[1].confidence).toBe(0);
  });
});
