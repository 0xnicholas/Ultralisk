import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db/index.js';
const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

import { handleAlertWebhook, checkThresholds, autoResolveStale } from './incidentEngine.js';

beforeEach(() => {
  mockQuery.mockReset();
});

const sampleWebhook = {
  receiver: 'ultralisk',
  status: 'firing' as const,
  alerts: [
    {
      status: 'firing' as const,
      labels: {
        alertname: 'GPUUtilizationCrash',
        severity: 'critical',
        node: 'gpu-node-3',
        cluster: 'prod-us-east',
        org_id: 'org_001',
      },
      annotations: {
        summary: 'GPU utilization dropped to 2% on gpu-node-3',
        description: 'GPU utilization on gpu-node-3 card-2 dropped from 85% to 2%',
      },
      startsAt: '2026-07-17T14:23:00Z',
      endsAt: '',
      generatorURL: 'http://prometheus.example.com/graph?g0=...',
      fingerprint: 'abc123def456',
    },
  ],
};

describe('handleAlertWebhook', () => {
  it('creates incident + alert for firing alert', async () => {
    // Dedup check: no existing open incident
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Create incident
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'inc_001', severity: 'critical', title: 'GPU utilization dropped to 2% on gpu-node-3', affected_entities: { node_id: 'gpu-node-3' } }] });
    // Create alert
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await handleAlertWebhook(sampleWebhook);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
  });

  it('deduplicates by fingerprint', async () => {
    // Dedup check: existing open incident found
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'inc_existing' }] });

    const result = await handleAlertWebhook(sampleWebhook);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
  });

  it('handles resolved alert by mitigating incident', async () => {
    const resolvedWebhook = {
      ...sampleWebhook,
      status: 'resolved' as const,
      alerts: [{
        ...sampleWebhook.alerts[0],
        status: 'resolved' as const,
      }],
    };

    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'inc_001' }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await handleAlertWebhook(resolvedWebhook);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
  });

  it('validates webhook payload structure', async () => {
    const result = await handleAlertWebhook({} as any);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
  });
});

describe('autoResolveStale', () => {
  it('resolves mitigated incidents older than 24h', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'inc_stale' }] });
    const result = await autoResolveStale();
    expect(result.resolved).toBe(1);
  });

  it('returns 0 when no stale incidents', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await autoResolveStale();
    expect(result.resolved).toBe(0);
  });
});

describe('checkThresholds', () => {
  it('creates incidents for threshold violations', async () => {
    // Cooldown check: no recent incidents
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Metric query: returns a row showing crash pattern
    mockQuery.mockResolvedValueOnce({
      rows: [{
        node_id: 'gpu-node-3',
        card_index: 0,
        utilization_pct: 3,
        memory_used_mb: 5000,
        temperature: 55,
        timestamp: new Date(),
        total_memory_mb: 81920,
      }],
    });
    // Prior value check: show it was recently higher
    mockQuery.mockResolvedValueOnce({ rows: [{ utilization_pct: 72 }] });
    // Create incident
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'inc_threshold' }] });

    const result = await checkThresholds();
    expect(result.created).toBeGreaterThanOrEqual(1);
  });

  it('respects cooldown period', async () => {
    // Cooldown check: recent incident found
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'recent' }] });

    const result = await checkThresholds();
    expect(result.created).toBe(0);
  });

  it('skips when no metrics available', async () => {
    // Cooldown check: no recent incident
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Metric query: empty
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await checkThresholds();
    expect(result.created).toBe(0);
  });
});
