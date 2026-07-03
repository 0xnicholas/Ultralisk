"""模块一验收:月度配额 PG 写穿(用 sqlite 跑真实 upsert SQL)+ 日/月分离 store。

sqlite 支持 ON CONFLICT DO UPDATE 与 RETURNING(3.35+),可真实验证 SQL 语义,
无需真 PostgreSQL。生产用 psycopg,占位符切到 %s。
"""
import sqlite3

import pytest

from app.quota.service import (
    InMemoryCounterStore,
    QuotaExceeded,
    QuotaPolicy,
    QuotaService,
    month_str,
)
from app.quota.sql_store import SqlMonthlyStore, _parse_month_key


def make_sql_store():
    conn = sqlite3.connect(":memory:")
    store = SqlMonthlyStore(conn, placeholder="?")
    store.ensure_schema()
    return store


def test_parse_month_key_handles_caller_with_colon():
    caller, month = _parse_month_key("quota:month:tenant:abc:2026-07")
    assert caller == "tenant:abc"
    assert month == "2026-07"


def test_sql_upsert_accumulates_atomically():
    store = make_sql_store()
    key = "quota:month:c1:2026-07"
    assert store.increment(key, 100, 0) == 100
    assert store.increment(key, 50, 0) == 150  # 累加,不覆盖
    assert store.get(key) == 150


def test_sql_get_missing_returns_zero():
    store = make_sql_store()
    assert store.get("quota:month:nobody:2026-07") == 0


def test_sql_months_are_isolated():
    store = make_sql_store()
    store.increment("quota:month:c1:2026-06", 10, 0)
    store.increment("quota:month:c1:2026-07", 5, 0)
    assert store.get("quota:month:c1:2026-06") == 10
    assert store.get("quota:month:c1:2026-07") == 5


def test_sql_cleanup_removes_old_months():
    store = make_sql_store()
    store.increment("quota:month:c1:2026-05", 10, 0)
    store.increment("quota:month:c1:2026-06", 10, 0)
    store.increment("quota:month:c1:2026-07", 10, 0)
    deleted = store.cleanup(keep_before_month="2026-07")
    assert deleted == 2
    assert store.get("quota:month:c1:2026-07") == 10
    assert store.get("quota:month:c1:2026-06") == 0


def test_quota_service_uses_separate_daily_and_monthly_stores():
    daily = InMemoryCounterStore()
    monthly = make_sql_store()
    svc = QuotaService(daily, monthly)
    policy = QuotaPolicy(daily_token_quota=100, monthly_token_quota=1000)

    d, m = svc.record("c1", 40)
    assert (d, m) == (40, 40)
    # 月度累计落在 SQL store
    assert monthly.get(f"quota:month:c1:{month_str()}") == 40
    svc.check("c1", policy)  # 未超


def test_quota_service_monthly_persists_independently_of_daily():
    """日 store 清零(模拟 Redis 重启)不影响月度累计(PG 持久)。"""
    daily = InMemoryCounterStore()
    monthly = make_sql_store()
    svc = QuotaService(daily, monthly)
    policy = QuotaPolicy(daily_token_quota=10_000, monthly_token_quota=100)

    svc.record("c1", 100)
    # 模拟 Redis 重启:换一个空的日 store
    svc2 = QuotaService(InMemoryCounterStore(), monthly)
    with pytest.raises(QuotaExceeded) as ei:
        svc2.check("c1", policy)
    assert ei.value.scope == "monthly"  # 月度累计仍在,配额仍被正确拦截
