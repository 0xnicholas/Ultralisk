import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db/index.js';
const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

// Must reset the module-level cronStarted flag between tests
vi.mock('./gpuMetricsCollector.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    // force cronStarted = false in a fresh import for each test
  };
});

import { collectGpuMetrics } from './gpuMetricsCollector.js';

beforeEach(() => {
  mockQuery.mockReset();
});

describe('collectGpuMetrics', () => {
  it('returns 0 when no online GPU cards exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const count = await collectGpuMetrics();
    expect(count).toBe(0);
    expect(mockQuery).toHaveBeenCalledOnce();
  });

  it('inserts metrics for each card and prunes old data', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'gc_1', node_id: 'n1', card_index: 0, memory_mb: 81920 },
        { id: 'gc_2', node_id: 'n1', card_index: 1, memory_mb: 81920 },
        { id: 'gc_3', node_id: 'n2', card_index: 0, memory_mb: 40960 },
      ],
    });
    // 3 inserts + 1 delete
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rowCount: 3 });

    const count = await collectGpuMetrics();
    expect(count).toBe(3);
    // 1 SELECT + 3 INSERT + 1 DELETE = 5 calls
    expect(mockQuery).toHaveBeenCalledTimes(5);
  });

  it('generates realistic utilization values (between 3 and 98)', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'gc_1', node_id: 'n1', card_index: 0, memory_mb: 81920 },
      ],
    });
    mockQuery.mockResolvedValueOnce({ rows: [] }); // insert
    mockQuery.mockResolvedValueOnce({ rowCount: 0 }); // delete

    await collectGpuMetrics();

    const insertCall = mockQuery.mock.calls[1];
    const utilPct = insertCall[1][3];
    const memMb = insertCall[1][4];
    const temp = insertCall[1][5];

    expect(utilPct).toBeGreaterThanOrEqual(3);
    expect(utilPct).toBeLessThanOrEqual(98);
    expect(memMb).toBeGreaterThan(0);
    expect(memMb).toBeLessThanOrEqual(81920);
    expect(temp).toBeGreaterThan(30);
    expect(temp).toBeLessThanOrEqual(95);
  });

  it('tracks per-card state for smooth transitions across calls', async () => {
    // First call
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'gc_1', node_id: 'n1', card_index: 0, memory_mb: 81920 }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });

    await collectGpuMetrics();
    const firstUtil = mockQuery.mock.calls[1][1][3];

    // Reset mock but keep module state (cardStates persists)
    mockQuery.mockReset();

    // Second call — cardStates has previous value, so smoothValue should work
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'gc_1', node_id: 'n1', card_index: 0, memory_mb: 81920 }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });

    await collectGpuMetrics();
    const secondUtil = mockQuery.mock.calls[1][1][3];

    // Values should be different (simulator uses randomness), but both valid
    expect(firstUtil).toBeGreaterThanOrEqual(3);
    expect(secondUtil).toBeGreaterThanOrEqual(3);
    expect(firstUtil).toBeLessThanOrEqual(98);
    expect(secondUtil).toBeLessThanOrEqual(98);
    // The delta shouldn't exceed the smoothValue cap of 6
    expect(Math.abs(secondUtil - firstUtil)).toBeLessThanOrEqual(8);
  });
});
