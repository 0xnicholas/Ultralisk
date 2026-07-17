import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock PG pool
vi.mock('../db/index.js', () => ({
  default: { query: vi.fn() },
}));

import pool from '../db/index.js';
const mockQuery = pool.query as unknown as ReturnType<typeof vi.fn>;

// Import after mocks
import { client } from './clickhouseClient.js';

beforeEach(() => {
  mockQuery.mockReset();
});

describe('ClickHouse client (PG fallback)', () => {
  it('reports postgres as active backend when CH is not configured', () => {
    expect(client.activeBackend).toBe('postgres');
    expect(client.isConnected()).toBe(false);
  });

  it('query() falls back to PG and translates ClickHouse SQL', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ avg_utilization: 45.5, idle_count: 3 }],
    });

    const result = await client.query(
      `SELECT
        toStartOfHour(timestamp) AS bucket,
        avgState(utilization_pct) AS avg_utilization,
        count() AS idle_count
      FROM gpu_metric_snapshots
      WHERE timestamp > NOW() - INTERVAL '72 hours'
      GROUP BY bucket
      ORDER BY bucket`
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].avg_utilization).toBe(45.5);
    // Should have translated ClickHouse SQL to PG dialect
    const calledSql = mockQuery.mock.calls[0][0];
    expect(calledSql).not.toContain('avgState');
    expect(calledSql).not.toContain('toStartOfHour');
    expect(calledSql).toContain('DATE_TRUNC');
  });

  it('query() returns empty rows for empty results', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await client.query('SELECT * FROM gpu_metric_snapshots WHERE 1=0');
    expect(result.rows).toEqual([]);
  });

  it('insert() with no rows is a no-op', async () => {
    await client.insert('gpu_metric_snapshots', []);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('insert() falls back to PG with individual row inserts', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await client.insert('gpu_metric_snapshots', [
      { node_id: 'n1', card_index: 0, utilization_pct: 75, timestamp: new Date().toISOString() },
      { node_id: 'n1', card_index: 1, utilization_pct: 50, timestamp: new Date().toISOString() },
    ]);

    expect(mockQuery).toHaveBeenCalledTimes(2);
    const [firstSql, firstParams] = mockQuery.mock.calls[0];
    expect(firstSql).toContain('INSERT INTO gpu_metric_snapshots');
    expect(firstParams[0]).toBe('n1');
    expect(firstParams[1]).toBe(0);
    expect(firstParams[2]).toBe(75);
  });

  it('handles SQL translation edge cases', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await client.query(`
      SELECT
        toStartOfMonth(recorded_at) AS month,
        sumState(cost_usd) AS total_cost
      FROM cost_data
      GROUP BY month
      ORDER BY month
    `);

    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain("DATE_TRUNC('month'");
    expect(sql).toContain('sum(');
    expect(sql).not.toContain('sumState');
  });
});
