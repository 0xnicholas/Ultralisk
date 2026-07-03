"""OpenTelemetry 分布式追踪(可选薄封装)。

设计(本次讨论结论):
- 手动流水线 span(输入安全/配额/推理/输出安全/回写)—— 引擎无关,能看内部瓶颈。
- 可选自动:装了 opentelemetry-instrumentation-httpx 则自动为出站推理/审核调用打 span
  并注入 traceparent,vLLM 的 span 可挂到同一 trace。
- 保留 request_id;trace_id/span_id 注入日志(Loki↔Tempo 关联)。
- 未装 opentelemetry 或未启用时全程 no-op,pytest 不受影响。
"""
from __future__ import annotations

from contextlib import contextmanager

_TRACER = None
_ENABLED = False


def configure_tracing(settings) -> bool:
    """按配置初始化。返回是否真正启用(未启用/依赖缺失则 False,后续 span 为 no-op)。"""
    global _TRACER, _ENABLED
    if not getattr(settings, "tracing_enabled", False):
        return False
    try:
        from opentelemetry import trace
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except Exception:
        return False

    resource = Resource.create({"service.name": settings.service_name})
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(_make_exporter(settings)))
    trace.set_tracer_provider(provider)
    _TRACER = trace.get_tracer("ultralisk")
    _ENABLED = True

    # 可选:自动为 httpx 出站调用打 span + 注入 traceparent
    try:
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

        HTTPXClientInstrumentor().instrument()
    except Exception:
        pass
    return True


def _make_exporter(settings):
    from opentelemetry.sdk.trace.export import ConsoleSpanExporter

    if settings.otel_exporter == "otlp":
        try:
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

            return OTLPSpanExporter(endpoint=settings.otlp_endpoint)
        except Exception:
            return ConsoleSpanExporter()
    return ConsoleSpanExporter()


@contextmanager
def span(name: str, **attributes):
    """流水线 span 上下文。no-op 安全:未启用时不产生任何开销。"""
    if not _ENABLED or _TRACER is None:
        yield None
        return
    with _TRACER.start_as_current_span(name) as sp:
        for k, v in attributes.items():
            if v is not None:
                sp.set_attribute(k, v)
        yield sp


def current_ids() -> tuple[str | None, str | None]:
    """当前 span 的 (trace_id, span_id) 十六进制;无有效上下文返回 (None, None)。"""
    if not _ENABLED:
        return None, None
    try:
        from opentelemetry import trace

        ctx = trace.get_current_span().get_span_context()
        if not ctx.is_valid:
            return None, None
        return format(ctx.trace_id, "032x"), format(ctx.span_id, "016x")
    except Exception:
        return None, None


def _set_state_for_test(tracer, enabled: bool) -> None:
    """测试钩子:注入自建 tracer(如 InMemorySpanExporter)以断言 span。"""
    global _TRACER, _ENABLED
    _TRACER = tracer
    _ENABLED = enabled
