-- ClickHouse schema: GPU metric snapshots (time-series)
--
-- Replaces PG gpu_metric_snapshots for analytics queries.
-- PG remains the write target for the collector; data is replicated
-- to ClickHouse via async copy (see docs/adr/007-observability-stack.md).
--
-- Engine: MergeTree ordered by (node_id, card_index, timestamp) for
-- fast range scans on per-card time series.

CREATE TABLE IF NOT EXISTS ultralisk.gpu_metric_snapshots (
    node_id         UUID,
    card_index      UInt8,
    timestamp       DateTime64(3, 'UTC'),
    utilization_pct Float32,
    memory_used_mb  UInt32,
    temperature     Float32,
    _inserted_at    DateTime DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (node_id, card_index, timestamp)
TTL _inserted_at + INTERVAL 90 DAY DELETE;

-- Materialized view: hourly rollup for dashboard queries
CREATE MATERIALIZED VIEW IF NOT EXISTS ultralisk.gpu_metric_hourly
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(bucket)
ORDER BY (node_id, card_index, bucket)
AS SELECT
    node_id,
    card_index,
    toStartOfHour(timestamp) AS bucket,
    avgState(utilization_pct) AS avg_utilization,
    minState(utilization_pct) AS min_utilization,
    maxState(utilization_pct) AS max_utilization,
    avgState(memory_used_mb) AS avg_memory_mb,
    avgState(temperature) AS avg_temperature,
    count() AS sample_count
FROM ultralisk.gpu_metric_snapshots
GROUP BY node_id, card_index, bucket;
