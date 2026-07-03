"""应用/网关层 Prometheus 指标。

对应 docs/tech-stack.md 模块二补充坑:vLLM 自带的是引擎级指标,
网关层的鉴权失败、限流拒绝、审核拦截这些**引擎抓不到**,需在应用层单独暴露。

prometheus_client 为可选依赖:未安装时降级为 no-op,核心逻辑仍可测。
"""
from __future__ import annotations

try:
    from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

    _ENABLED = True
except Exception:  # pragma: no cover - 依赖缺失降级
    _ENABLED = False
    CONTENT_TYPE_LATEST = "text/plain"


class _NoopMetric:
    def labels(self, *a, **k):
        return self

    def inc(self, *a, **k):
        pass

    def observe(self, *a, **k):
        pass


if _ENABLED:
    REQUESTS_TOTAL = Counter(
        "ultralisk_requests_total", "请求总数", ["route", "status"]
    )
    REQUESTS_REJECTED = Counter(
        "ultralisk_requests_rejected_total", "被拒请求(细分原因)", ["reason"]
    )  # reason: auth | rate_limit | quota_daily | quota_monthly | safety_input | safety_output
    SAFETY_HITS = Counter(
        "ultralisk_safety_hits_total", "内容安全命中", ["stage", "category"]
    )
    REQUEST_LATENCY = Histogram(
        "ultralisk_request_latency_seconds", "端到端请求耗时", ["route"]
    )
    TOKENS_TOTAL = Counter(
        "ultralisk_tokens_total", "token 用量", ["direction"]  # input | output
    )
else:  # pragma: no cover
    REQUESTS_TOTAL = REQUESTS_REJECTED = SAFETY_HITS = REQUEST_LATENCY = TOKENS_TOTAL = _NoopMetric()


def metrics_response() -> tuple[bytes, str]:
    """返回 (body, content_type),供 /metrics 端点使用。"""
    if not _ENABLED:
        return b"# prometheus_client not installed\n", CONTENT_TYPE_LATEST
    return generate_latest(), CONTENT_TYPE_LATEST
