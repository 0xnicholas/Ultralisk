-- ClickHouse schema: usage events (analytics copy)
--
-- Async replica of PG raw_usage_events for fast analytical queries.
-- Source of truth remains PostgreSQL.

CREATE TABLE IF NOT EXISTS ultralisk.usage_events (
    request_id        String,
    api_key_id        String,
    user_id           String,
    org_id            String,
    model_id          String,
    prompt_tokens     UInt32,
    completion_tokens UInt32,
    started_at        DateTime64(3, 'UTC'),
    completed_at      DateTime64(3, 'UTC'),
    status            String,
    _inserted_at      DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(_inserted_at)
PARTITION BY toYYYYMM(completed_at)
ORDER BY (org_id, completed_at, request_id)
TTL _inserted_at + INTERVAL 365 DAY DELETE;

-- Materialized view: hourly usage rollup per org + model
CREATE MATERIALIZED VIEW IF NOT EXISTS ultralisk.usage_hourly
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (org_id, model_id, hour)
AS SELECT
    org_id,
    model_id,
    toStartOfHour(completed_at) AS hour,
    count() AS request_count,
    sumState(prompt_tokens) AS total_prompt_tokens,
    sumState(completion_tokens) AS total_completion_tokens,
    avgState(completed_at - started_at) AS avg_latency_ms
FROM ultralisk.usage_events
WHERE status = 'completed'
GROUP BY org_id, model_id, hour;
