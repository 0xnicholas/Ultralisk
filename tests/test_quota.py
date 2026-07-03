"""模块一验收:token 配额(超限拒绝 + Retry-After + 回写)。

QPS 限流由 Kong 负责,不在此单测;这里覆盖网关做不了的 token 用量配额。
"""
import pytest

from app.quota.service import (
    InMemoryCounterStore,
    QuotaExceeded,
    QuotaPolicy,
    QuotaService,
)

POLICY = QuotaPolicy(daily_token_quota=100, monthly_token_quota=1000)


def make_service():
    return QuotaService(InMemoryCounterStore())


def test_under_quota_passes():
    svc = make_service()
    svc.check("caller-a", POLICY)  # 初始为 0,不抛
    daily, monthly = svc.record("caller-a", 30)
    assert (daily, monthly) == (30, 30)
    svc.check("caller-a", POLICY)  # 30 < 100,仍放行


def test_daily_quota_exceeded_returns_retry_after():
    svc = make_service()
    svc.record("caller-b", 100)  # 打满当日
    with pytest.raises(QuotaExceeded) as ei:
        svc.check("caller-b", POLICY)
    err = ei.value
    assert err.scope == "daily"
    assert err.limit == 100
    assert err.retry_after > 0  # 用于 HTTP Retry-After 头


def test_monthly_quota_exceeded():
    svc = make_service()
    # 每次 record 同时累加日与月;用一个高日配额只触发月配额
    policy = QuotaPolicy(daily_token_quota=10_000, monthly_token_quota=1000)
    svc.record("caller-c", 1000)
    with pytest.raises(QuotaExceeded) as ei:
        svc.check("caller-c", policy)
    assert ei.value.scope == "monthly"


def test_callers_are_isolated():
    svc = make_service()
    svc.record("caller-x", 100)
    # 另一个调用方不受影响(分级/隔离)
    svc.check("caller-y", POLICY)
