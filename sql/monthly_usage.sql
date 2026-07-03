-- 月度 token 配额持久化表(PostgreSQL 生产版)
-- 对应 app/quota/sql_store.py:SqlMonthlyStore
-- 日计数在 Redis(短期,TTL 自动过期);月计数写穿到此表(持久、崩溃不丢)。

CREATE TABLE IF NOT EXISTS monthly_usage (
    caller_id  TEXT        NOT NULL,          -- 调用方标识(API Key ID)
    month      TEXT        NOT NULL,          -- 'YYYY-MM'
    tokens     BIGINT      NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (caller_id, month)
);

-- 保留任务用:按 month 清理旧数据的范围扫描
CREATE INDEX IF NOT EXISTS idx_monthly_usage_month ON monthly_usage (month);

-- 写穿 upsert(应用中执行,示意):
--   INSERT INTO monthly_usage (caller_id, month, tokens)
--   VALUES ($1, $2, $3)
--   ON CONFLICT (caller_id, month)
--   DO UPDATE SET tokens = monthly_usage.tokens + EXCLUDED.tokens,
--                 updated_at = now()
--   RETURNING tokens;

-- 保留清理(示意,保留最近 N 个月;由定时任务执行):
--   DELETE FROM monthly_usage WHERE month < to_char(now() - interval '12 months', 'YYYY-MM');
