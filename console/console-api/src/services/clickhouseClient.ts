/**
 * ClickHouse client with automatic PG fallback.
 *
 * When ClickHouse is configured (CLICKHOUSE_HOST env var), queries are
 * routed to ClickHouse for fast analytical aggregations. When unavailable,
 * the same query interface transparently falls back to PostgreSQL.
 *
 * This lets the Console API work in dev mode without ClickHouse while
 * being production-ready with minimal code changes.
 */

import pool from '../db/index.js';
import { logger } from '../logger.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type QueryResult = {
  rows: Record<string, any>[];
  meta?: Array<{ name: string; type: string }>;
};

export interface ClickHouseClient {
  /** Query ClickHouse (with PG fallback). */
  query(sql: string, params?: Record<string, unknown>): Promise<QueryResult>;

  /** Insert rows into ClickHouse. */
  insert(table: string, rows: Record<string, unknown>[]): Promise<void>;

  /** Check whether ClickHouse is connected. */
  isConnected(): boolean;

  /** Name of the active backend ('clickhouse' | 'postgres'). */
  activeBackend: string;
}

// ── PG fallback ───────────────────────────────────────────────────────────────

/**
 * Translates simple ClickHouse-style SELECT queries to PG equivalents.
 * This is a best-effort translation for the limited set of queries used
 * by the console-api routes. Complex ClickHouse-specific syntax will
 * still require ClickHouse.
 */
function pgQuery(sql: string, _params?: Record<string, unknown>): Promise<QueryResult> {
  // Translate ClickHouse SQL dialect to PostgreSQL.
  // The pipeline handles both DDL patterns (CREATE TABLE) and SELECT queries.
  let pgSql = sql
    // ── SELECT query translation (must run before DDL cleanup to avoid
    //     clobbering count() → count(*) and aggregate patterns) ──
    // Replace toStartOfHour(expr) with DATE_TRUNC('hour', expr)
    .replace(/toStartOfHour\(([^)]+)\)/gi, "DATE_TRUNC('hour', $1)")
    // Replace toStartOfMonth(expr) with DATE_TRUNC('month', expr)
    .replace(/toStartOfMonth\(([^)]+)\)/gi, "DATE_TRUNC('month', $1)")
    // Replace toYYYYMM(expr) with TO_CHAR(expr, 'YYYYMM')::int
    .replace(/toYYYYMM\(([^)]+)\)/gi, "TO_CHAR($1, 'YYYYMM')::int")
    // Handle ClickHouse State aggregate functions (avgState → avg, etc.)
    .replace(/\b(avg|sum|min|max)State\s*\(/gi, '$1(')
    // Handle count() without arguments (valid in CH, needs * in PG)
    .replace(/\bcount\(\)/gi, 'count(*)')
    // Remove _inserted_at from SELECT lists
    .replace(/,\s*_inserted_at\b/gi, '')
    .trim();

  // ── DDL cleanup (safe for SELECT-only queries too) ──
  pgSql = pgSql
    // Remove TTL entire clause (ends at `;` or line end)
    .replace(/TTL\s+.*?(?:;|\n|$)/g, '')
    // Remove PARTITION BY with function-call or parenthesized expression
    .replace(/PARTITION\s+BY\s+(?:\([^)]*\)|\S+)/gi, '')
    // Remove DDL ORDER BY with parenthesized column list (e.g. ORDER BY (a, b, c))
    .replace(/ORDER\s+BY\s+\([^)]+\)/gi, '')
    // Replace MergeTree engine references, including empty parens:
    //   ENGINE = MergeTree()          → ENGINE =
    //   ENGINE = ReplacingMergeTree(x) → ENGINE =
    //   ENGINE = AggregatingMergeTree() → ENGINE =
    .replace(/\b(?:Replacing)?(?:Aggregating)?MergeTree\s*\([^)]*\)/gi, '')
    .replace(/\b(?:Replacing)?(?:Aggregating)?MergeTree\b/gi, '')
    // Remove bare ENGINE = type clause (WITHOUT touching SELECT aliases or count())
    .replace(/ENGINE\s*=\s*\w+(?:\s*\([^)]*\))?/gi, '')
    .trim();

  // Remove leftover standalone ORDER BY that became empty (rare edge case)
  pgSql = pgSql.replace(/ORDER\s+BY\s*$/gi, '').trim();

  // For INSERT queries, delegate to PG directly
  if (/^INSERT\s+INTO/i.test(pgSql)) {
    return pool.query(pgSql).then((result: any) => ({ rows: result.rows || [] }));
  }

  return pool.query(pgSql).then((result: any) => ({ rows: result.rows || [] }));
}

// ── ClickHouse connection ─────────────────────────────────────────────────────

let clickhouseClient: any = null;
let clickhouseConnected = false;
let activeBackend: string = 'postgres';

function getConfig() {
  return {
    host: process.env.CLICKHOUSE_HOST || '',
    port: parseInt(process.env.CLICKHOUSE_PORT || '8443'),
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
    database: process.env.CLICKHOUSE_DB || 'ultralisk',
  };
}

async function connectClickHouse(): Promise<boolean> {
  const cfg = getConfig();
  if (!cfg.host) {
    logger.info('ClickHouse not configured (CLICKHOUSE_HOST unset). Using PostgreSQL fallback.');
    return false;
  }

  try {
    // @ts-expect-error -- @clickhouse/client is optional
    const { createClient } = await import('@clickhouse/client');
    clickhouseClient = createClient({
      host: `http://${cfg.host}:${cfg.port}`,
      username: cfg.username,
      password: cfg.password,
      database: cfg.database,
      clickhouse_settings: {
        date_time_output_format: 'iso',
        enable_http_compression: true,
      },
    });

    // Verify connection with a ping query
    await clickhouseClient.query({ query: 'SELECT 1', format: 'JSONEachRow' });
    clickhouseConnected = true;
    activeBackend = 'clickhouse';
    logger.info({ host: cfg.host, database: cfg.database }, 'ClickHouse connected');
    return true;
  } catch (err) {
    clickhouseConnected = false;
    activeBackend = 'postgres';
    logger.warn({ err }, 'ClickHouse connection failed; falling back to PostgreSQL');
    return false;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

async function query(sql: string, params?: Record<string, unknown>): Promise<QueryResult> {
  if (clickhouseConnected && clickhouseClient) {
    try {
      const result = await clickhouseClient.query({
        query: sql,
        format: 'JSONEachRow',
        query_params: params,
      });
      const rows: Record<string, any>[] = await result.json();
      return { rows };
    } catch (err) {
      logger.error({ err, sql: sql.slice(0, 200) }, 'ClickHouse query failed, falling back to PG');
      return pgQuery(sql, params);
    }
  }
  return pgQuery(sql, params);
}

async function insert(table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (clickhouseConnected && clickhouseClient) {
    try {
      await clickhouseClient.insert({
        table,
        values: rows,
        format: 'JSONEachRow',
      });
      return;
    } catch (err) {
      logger.error({ err, table }, 'ClickHouse insert failed, falling back to PG');
    }
  }
  // PG fallback for inserts
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  const cols = keys.join(', ');
  const placeholders = keys.map(() => '?').join(', ');
  for (const row of rows) {
    const values = keys.map((k) => row[k]);
    await pool.query(
      `INSERT INTO ${table} (${cols}) VALUES (${placeholders})`,
      values
    );
  }
}

function isConnected(): boolean {
  return clickhouseConnected;
}

// ── Lazy initialization ───────────────────────────────────────────────────────

let initialized = false;

/** Initialize ClickHouse connection. Called once at boot. */
export async function initClickHouse(): Promise<ClickHouseClient> {
  if (initialized) return client;
  initialized = true;

  if (getConfig().host) {
    await connectClickHouse();
  }

  return client;
}

export const client: ClickHouseClient = {
  query,
  insert,
  isConnected,
  get activeBackend() { return activeBackend; },
};
