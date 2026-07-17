-- ClickHouse schema: cost analytics
--
-- Daily aggregated cost records per dimension, mirrored from PG cost_data.
-- ClickHouse enables fast multi-dimensional drill-down across org/dimension/date.

CREATE TABLE IF NOT EXISTS ultralisk.cost_data (
    org_id          UUID,
    dimension       String,   -- 'model' | 'endpoint' | 'api_key' | 'team'
    dimension_key   String,
    dimension_name  String,
    cost_usd        Float32,
    gpu_hours       Float32,
    tokens_m        Float32,
    recorded_at     Date,
    _inserted_at    DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(_inserted_at)
PARTITION BY toYYYYMM(recorded_at)
ORDER BY (org_id, dimension, recorded_at, dimension_key)
TTL _inserted_at + INTERVAL 365 DAY DELETE;

-- Materialized view: monthly cost summary per org per dimension
CREATE MATERIALIZED VIEW IF NOT EXISTS ultralisk.cost_monthly
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(month)
ORDER BY (org_id, dimension, dimension_name, month)
AS SELECT
    org_id,
    dimension,
    dimension_name,
    toStartOfMonth(recorded_at) AS month,
    sumState(cost_usd) AS total_cost_usd,
    sumState(gpu_hours) AS total_gpu_hours,
    sumState(tokens_m) AS total_tokens_m
FROM ultralisk.cost_data
GROUP BY org_id, dimension, dimension_name, month;
