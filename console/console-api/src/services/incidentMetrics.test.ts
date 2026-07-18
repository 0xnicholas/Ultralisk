import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock PG pool
vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db/index.js';
const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

import { fetchRelatedMetrics } from './incidentMetrics.js';

beforeEach(() => {
  mockQuery.mockReset();
});

describe('fetchRelatedMetrics', () => {
  it('returns synthetic data when no nodeId provided', async () => {
    const result = await fetchRelatedMetrics({});
    expect(result.utilizationPct.length).toBeGreaterThan(0);
    expect(result.memoryUsedMb.length).toBeGreaterThan(0);
    expect(result.temperature.length).toBeGreaterThan(0);
    expect(result.timestamps.length).toBe(result.utilizationPct.length);
    // Verify synthetic pattern: should have at least one spike before a drop
    const maxUtil = Math.max(...result.utilizationPct);
    const minUtil = Math.min(...result.utilizationPct);
    expect(maxUtil).toBeGreaterThan(80); // spike above 80%
    expect(minUtil).toBeLessThanOrEqual(5); // drop to near-zero
  });

  it('returns real data from PG when nodeId is provided', async () => {
    const mockRows = [
      { utilization_pct: 45.5, memory_used_mb: 40000, temperature: 58, timestamp: new Date('2026-07-17T14:20:00Z') },
      { utilization_pct: 72.1, memory_used_mb: 52000, temperature: 62, timestamp: new Date('2026-07-17T14:21:00Z') },
      { utilization_pct: 88.3, memory_used_mb: 68000, temperature: 71, timestamp: new Date('2026-07-17T14:22:00Z') },
    ];
    mockQuery.mockResolvedValueOnce({ rows: mockRows });

    const result = await fetchRelatedMetrics({ nodeId: 'node-123', windowMinutes: 10 });
    expect(result.utilizationPct).toEqual([45.5, 72.1, 88.3]);
    expect(result.memoryUsedMb).toEqual([40000, 52000, 68000]);
    expect(result.temperature).toEqual([58, 62, 71]);
    expect(result.timestamps).toHaveLength(3);

    // Verify correct SQL was called
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain('gpu_metric_snapshots');
    expect(sql).toContain('node_id');
  });

  it('returns synthetic data when PG returns empty rows', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await fetchRelatedMetrics({ nodeId: 'node-999', windowMinutes: 10 });
    expect(result.utilizationPct.length).toBeGreaterThan(0);
  });

  it('returns synthetic data on PG query error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection failed'));

    const result = await fetchRelatedMetrics({ nodeId: 'node-123' });
    expect(result.utilizationPct.length).toBeGreaterThan(0);
  });

  it('respects maxPoints parameter', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: Array.from({ length: 100 }, (_, i) => ({
        utilization_pct: 50, memory_used_mb: 50000, temperature: 60,
        timestamp: new Date(Date.now() - (100 - i) * 30000),
      })),
    });

    const result = await fetchRelatedMetrics({ nodeId: 'node-123', maxPoints: 50 });
    expect(mockQuery.mock.calls[0][1][3]).toBe(50);
  });

  it('respects windowMinutes parameter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await fetchRelatedMetrics({ nodeId: 'node-123', windowMinutes: 60 });
    const params = mockQuery.mock.calls[0][1];
    expect(params[2]).toBe(60);  // windowMinutes
    expect(params[3]).toBe(60);  // maxPoints (default)
  });
});
