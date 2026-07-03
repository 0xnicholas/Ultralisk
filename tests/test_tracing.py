"""模块四验收:OpenTelemetry 追踪(手动流水线 span + trace_id 注入日志)。

用 InMemorySpanExporter 断言 span 生成,不需 collector/后端。
未启用时应全程 no-op(见 test_noop_when_disabled)。
"""
import asyncio
import logging

import pytest

from app import tracing
from app.api.service import ChatService
from app.inference.base import ChatMessage
from app.inference.mock import MockBackend
from app.quota.service import InMemoryCounterStore, QuotaPolicy, QuotaService
from app.safety.pipeline import SafetyPipeline
from app.safety.rules import RuleInputGuard, RuleOutputGuard


def run(coro):
    return asyncio.run(coro)


@pytest.fixture
def in_memory_tracing():
    """启用 tracing,导出到内存,便于断言。用后还原 no-op。"""
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
    from opentelemetry import trace

    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    tracer = provider.get_tracer("test")
    tracing._set_state_for_test(tracer, enabled=True)
    yield exporter
    tracing._set_state_for_test(None, enabled=False)


def build_service():
    logger = logging.getLogger("test-trace")
    logger.addHandler(logging.NullHandler())
    svc = ChatService(
        backend=MockBackend(),
        quota=QuotaService(InMemoryCounterStore()),
        safety=SafetyPipeline([RuleInputGuard()], [RuleOutputGuard()]),
        logger=logger,
    )
    return svc, QuotaPolicy(100_000, 2_000_000)


def test_noop_when_disabled():
    # 默认未启用:span 为 no-op,current_ids 返回 (None, None)
    tracing._set_state_for_test(None, enabled=False)
    with tracing.span("x") as sp:
        assert sp is None
    assert tracing.current_ids() == (None, None)


def test_current_ids_valid_inside_span(in_memory_tracing):
    with tracing.span("unit"):
        trace_id, span_id = tracing.current_ids()
        assert trace_id and len(trace_id) == 32
        assert span_id and len(span_id) == 16


def test_handle_emits_pipeline_spans(in_memory_tracing):
    svc, policy = build_service()
    run(svc.handle(caller_id="c1", messages=[ChatMessage("user", "hi")], model="m", policy=policy))
    names = {s.name for s in in_memory_tracing.get_finished_spans()}
    # 外层 + 各阶段 span
    assert "chat.request" in names
    assert "safety.input" in names
    assert "inference.generate" in names
    assert "safety.output" in names
    assert "quota.record" in names


def test_spans_share_one_trace(in_memory_tracing):
    svc, policy = build_service()
    run(svc.handle(caller_id="c2", messages=[ChatMessage("user", "hi")], model="m", policy=policy))
    spans = in_memory_tracing.get_finished_spans()
    trace_ids = {s.get_span_context().trace_id for s in spans}
    assert len(trace_ids) == 1  # 全部挂在同一 trace 下


def test_log_gets_trace_id(in_memory_tracing):
    """log_request 在 span 内运行,应自动带上 trace_id/span_id。"""
    captured = {}

    class Grab(logging.Handler):
        def emit(self, record):
            captured.update(record.__dict__)

    logger = logging.getLogger("test-trace-log")
    logger.handlers.clear()
    logger.addHandler(Grab())
    logger.setLevel(logging.INFO)

    from app.logging_config import log_request

    with tracing.span("chat.request"):
        log_request(logger, request_id="rid", status="ok")
    assert captured.get("trace_id") and len(captured["trace_id"]) == 32
    assert captured.get("request_id") == "rid"  # request_id 保留
