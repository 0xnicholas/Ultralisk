import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock PG pool
vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db/index.js';
const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

import { executeRemediation, approveAction } from './autoRemediationService.js';
import type { DiagnosisResult } from './aiDiagnosisService.js';

const sampleOrgId = 'org_001';
const sampleIncidentId = 'inc_001';

const sampleDiagnosis: DiagnosisResult = {
  model_used: 'llama-3.3-70b-instruct',
  analyzed_at: new Date().toISOString(),
  root_causes: [{ cause: 'OOM', confidence: 0.9, evidence: 'memory spike' }],
  recommendations: [
    { action: 'Restart vLLM worker on node-gpu-3', risk: 'low', tier: 1 },
    { action: 'Scale up deployment llama-8b from 2 to 4 replicas', risk: 'medium', tier: 2 },
    { action: 'Rollback model to previous version 1.2.0', risk: 'high', tier: 3 },
  ],
  summary: 'OOM killed the worker.',
};

beforeEach(() => {
  mockQuery.mockReset();
});

describe('executeRemediation', () => {
  it('executes Tier 1 actions and logs Tier 2/3 as pending', async () => {
    // Policy lookup returns no row → use defaults
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Each action log append needs a SELECT + UPDATE
    // Tier 1 restart_worker: 2 queries (SELECT action_log, UPDATE)
    mockQuery.mockResolvedValueOnce({ rows: [{ action_log: [] }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Tier 2 needs approval: 2 queries
    mockQuery.mockResolvedValueOnce({ rows: [{ action_log: [] }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Tier 3 needs approval: 2 queries
    mockQuery.mockResolvedValueOnce({ rows: [{ action_log: [] }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await executeRemediation(sampleIncidentId, sampleOrgId, sampleDiagnosis);

    expect(result.executed).toHaveLength(1);
    expect(result.executed[0].action).toBe('auto_remediation.restart_worker');
    expect(result.executed[0].tier).toBe(1);
    // Gateway is unreachable in test environment — executor returns success: false, action logged as failed
    expect(result.executed[0].status).toBe('failed');
    expect(result.skipped).toHaveLength(0);
    expect(result.needsApproval).toHaveLength(2);
    expect(result.needsApproval[0].tier).toBe(2);
    expect(result.needsApproval[1].tier).toBe(3);
  });

  it('skips actions when policy is disabled', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ enabled: false, tiers: {} }],
    });

    const result = await executeRemediation(sampleIncidentId, sampleOrgId, sampleDiagnosis);
    expect(result.executed).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
    expect(result.needsApproval).toHaveLength(0);
  });

  it('skips actions not in allowed list', async () => {
    // Policy disallows restart_worker in tier1
    mockQuery.mockResolvedValueOnce({
      rows: [{
        enabled: true,
        tiers: {
          tier1: { enabled: true, allowedActions: ['notify_support'] },  // restart_worker not allowed
          tier2: { enabled: true, allowedActions: ['scale_up'] },
          tier3: { enabled: true, allowedActions: ['rollback_model'] },
        },
      }],
    });

    // Tier 1 restart_worker is skipped (not in allowed list)
    // Tier 2 scale_up needs approval: 2 queries
    mockQuery.mockResolvedValueOnce({ rows: [{ action_log: [] }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Tier 3 rollback_model needs approval: 2 queries
    mockQuery.mockResolvedValueOnce({ rows: [{ action_log: [] }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await executeRemediation(sampleIncidentId, sampleOrgId, sampleDiagnosis);

    expect(result.executed).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].action).toBe('auto_remediation.restart_worker');
    expect(result.skipped[0].status).toBe('skipped');
    expect(result.needsApproval).toHaveLength(2);
  });

  it('handles executor failure gracefully', async () => {
    // Mock pool to throw on the UPDATE after the first action log entry
    mockQuery.mockResolvedValueOnce({ rows: [] }); // policy
    mockQuery.mockResolvedValueOnce({ rows: [{ action_log: [] }] }); // SELECT for log
    mockQuery.mockRejectedValueOnce(new Error('DB write failed')); // UPDATE fails

    const diagnosis: DiagnosisResult = {
      ...sampleDiagnosis,
      recommendations: [{ action: 'Restart the worker on node-1', risk: 'low', tier: 1 }],
    };

    const result = await executeRemediation(sampleIncidentId, sampleOrgId, diagnosis);
    // Executor might succeed, but the DB write fails — the action is in executed
    expect(result.executed.length + result.needsApproval.length + result.skipped.length).toBeGreaterThanOrEqual(1);
  });
});

describe('approveAction', () => {
  it('executes a pending action by index', async () => {
    const actionLog = [
      {
        timestamp: '2026-01-01T00:00:00Z',
        action: 'auto_remediation.scale_up',
        tier: 2,
        triggeredBy: 'system',
        status: 'pending',
        details: { target: 'model-llama', reason: 'Scale up' },
      },
    ];
    mockQuery.mockResolvedValueOnce({ rows: [{ action_log: actionLog }] });
    mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE

    const result = await approveAction(sampleIncidentId, 0, 'user_abc');
    expect(result).not.toBeNull();
    // Console API is unreachable in test environment — executor returns success: false
    expect(result!.status).toBe('failed');
    expect(result!.action).toBe('auto_remediation.scale_up');
    expect(result!.triggeredBy).toBe('user');
  });

  it('returns null for already-executed action', async () => {
    const actionLog = [
      {
        timestamp: '2026-01-01T00:00:00Z',
        action: 'auto_remediation.scale_up',
        tier: 2,
        triggeredBy: 'system',
        status: 'success',
        details: {},
        result: { success: true, message: 'Done' },
      },
    ];
    mockQuery.mockResolvedValueOnce({ rows: [{ action_log: actionLog }] });

    const result = await approveAction(sampleIncidentId, 0, 'user_abc');
    expect(result).toBeNull();
  });

  it('returns null for out-of-bounds index', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ action_log: [] }] });
    const result = await approveAction(sampleIncidentId, 99, 'user_abc');
    expect(result).toBeNull();
  });
});
