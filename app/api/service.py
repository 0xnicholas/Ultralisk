"""全链路请求编排(框架无关,便于单测)。

顺序对应架构图:
  输入安全 → 配额预检 → 推理 → 输出安全 → 配额回写 → 结构化日志。

FastAPI 路由只做 HTTP <-> dataclass 转换,真正逻辑在此,保证可脱离 web 框架测试。
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field

from app import tracing
from app.inference.base import ChatMessage, InferenceBackend, InferenceError, InferenceRequest
from app.logging_config import log_request, new_request_id
from app.metrics import (
    REQUEST_LATENCY,
    REQUESTS_REJECTED,
    REQUESTS_TOTAL,
    SAFETY_HITS,
    TOKENS_TOTAL,
)
from app.quota.service import QuotaExceeded, QuotaPolicy, QuotaService
from app.safety.pipeline import SafetyPipeline
from app.safety.streaming import StreamingModerator


class RequestRejected(Exception):
    """业务拒绝(映射到 HTTP 状态码)。"""

    def __init__(self, status: int, reason: str, message: str, retry_after: int | None = None) -> None:
        self.status = status
        self.reason = reason  # 用于 metrics/日志
        self.message = message
        self.retry_after = retry_after
        super().__init__(message)


@dataclass
class ChatResult:
    request_id: str
    text: str
    model: str
    input_tokens: int
    output_tokens: int
    daily_used: int
    monthly_used: int
    total_ms: float
    meta: dict = field(default_factory=dict)


@dataclass
class StreamPiece:
    """流式输出事件。delta=内容块;done=结束(带 usage/配额);error=错误 reason。"""

    delta: str = ""
    done: bool = False
    usage: dict | None = None
    error: str | None = None


class ChatService:
    def __init__(
        self,
        backend: InferenceBackend,
        quota: QuotaService,
        safety: SafetyPipeline,
        logger,
    ) -> None:
        self._backend = backend
        self._quota = quota
        self._safety = safety
        self._log = logger

    async def handle(
        self,
        *,
        caller_id: str,
        messages: list[ChatMessage],
        model: str,
        policy: QuotaPolicy,
        max_tokens: int = 256,
        request_id: str | None = None,
    ) -> ChatResult:
        request_id = request_id or new_request_id()
        # 外层 span:包住全流水线(含 log_request),使日志能拿到 trace_id
        with tracing.span(
            "chat.request",
            **{
                "ultralisk.request_id": request_id,
                "ultralisk.model": model,
                "ultralisk.caller_id": caller_id,
            },
        ):
            return await self._handle_impl(
                caller_id=caller_id,
                messages=messages,
                model=model,
                policy=policy,
                max_tokens=max_tokens,
                request_id=request_id,
            )

    async def _handle_impl(
        self,
        *,
        caller_id: str,
        messages: list[ChatMessage],
        model: str,
        policy: QuotaPolicy,
        max_tokens: int = 256,
        request_id: str | None = None,
    ) -> ChatResult:
        request_id = request_id or new_request_id()
        t0 = time.perf_counter()
        route = "/v1/chat/completions"
        prompt = "\n".join(m.content for m in messages)

        input_action = "allow"
        output_action = "allow"
        try:
            # 1) 输入安全(规则引擎 + 审核模型,异步)
            with tracing.span("safety.input"):
                in_dec = await self._safety.acheck_input(prompt)
            if not in_dec.allowed:
                input_action = "block"
                for cat in in_dec.categories:
                    SAFETY_HITS.labels("input", cat).inc()
                REQUESTS_REJECTED.labels("safety_input").inc()
                raise RequestRejected(400, "safety_input", f"输入被内容安全拦截: {in_dec.reason}")

            # 2) 配额预检(推理前粗检是否已超)
            try:
                with tracing.span("quota.check"):
                    self._quota.check(caller_id, policy)
            except QuotaExceeded as e:
                REQUESTS_REJECTED.labels(f"quota_{e.scope}").inc()
                raise RequestRejected(429, f"quota_{e.scope}", str(e), retry_after=e.retry_after) from e

            # 3) 推理
            infer_t0 = time.perf_counter()
            try:
                with tracing.span("inference.generate", **{"ultralisk.backend": self._backend.name}):
                    resp = await self._backend.generate(
                        InferenceRequest(
                            messages=messages,
                            model=model,
                            max_tokens=max_tokens,
                            request_id=request_id,
                        )
                    )
            except InferenceError as e:
                REQUESTS_REJECTED.labels(f"inference_{e.kind}").inc()
                raise RequestRejected(e.status, f"inference_{e.kind}", str(e)) from e
            inference_ms = (time.perf_counter() - infer_t0) * 1000

            # 4) 输出安全(规则引擎脱敏 + 审核模型 BLOCK,异步)
            with tracing.span("safety.output"):
                out_dec = await self._safety.acheck_output(resp.text)
            text = out_dec.text
            if out_dec.categories:
                output_action = "redact"
                for cat in out_dec.categories:
                    SAFETY_HITS.labels("output", cat).inc()
            if not out_dec.allowed:
                output_action = "block"
                REQUESTS_REJECTED.labels("safety_output").inc()
                raise RequestRejected(400, "safety_output", f"输出被内容安全拦截: {out_dec.reason}")

            # 5) 配额回写(网关做不了的那步)
            with tracing.span("quota.record"):
                daily, monthly = self._quota.record(caller_id, resp.usage.total_tokens)
            TOKENS_TOTAL.labels("input").inc(resp.usage.input_tokens)
            TOKENS_TOTAL.labels("output").inc(resp.usage.output_tokens)

            total_ms = (time.perf_counter() - t0) * 1000
            REQUESTS_TOTAL.labels(route, "ok").inc()
            REQUEST_LATENCY.labels(route).observe(total_ms / 1000)

            log_request(
                self._log,
                request_id=request_id,
                caller_id=caller_id,
                model=model,
                input_tokens=resp.usage.input_tokens,
                output_tokens=resp.usage.output_tokens,
                inference_ms=round(inference_ms, 2),
                total_ms=round(total_ms, 2),
                status="ok",
                safety_input_action=input_action,
                safety_output_action=output_action,
            )
            return ChatResult(
                request_id=request_id,
                text=text,
                model=model,
                input_tokens=resp.usage.input_tokens,
                output_tokens=resp.usage.output_tokens,
                daily_used=daily,
                monthly_used=monthly,
                total_ms=round(total_ms, 2),
                meta=resp.meta,
            )
        except RequestRejected as e:
            REQUESTS_TOTAL.labels(route, "rejected").inc()
            log_request(
                self._log,
                request_id=request_id,
                caller_id=caller_id,
                model=model,
                total_ms=round((time.perf_counter() - t0) * 1000, 2),
                status="error",
                error_type=e.reason,
                safety_input_action=input_action,
                safety_output_action=output_action,
            )
            raise
        except Exception as e:  # 推理/未知错误
            REQUESTS_TOTAL.labels(route, "error").inc()
            log_request(
                self._log,
                request_id=request_id,
                caller_id=caller_id,
                model=model,
                total_ms=round((time.perf_counter() - t0) * 1000, 2),
                status="error",
                error_type=type(e).__name__,
            )
            raise

    def precheck(self, caller_id: str, prompt: str, policy: QuotaPolicy) -> None:
        """流式前同步预检:输入安全 + 配额。失败抛 RequestRejected,
        便于 HTTP 层在开始流传前返回正确状态码(而非 200 中途报错)。"""
        in_dec = self._safety.check_input(prompt)
        if not in_dec.allowed:
            for cat in in_dec.categories:
                SAFETY_HITS.labels("input", cat).inc()
            REQUESTS_REJECTED.labels("safety_input").inc()
            raise RequestRejected(400, "safety_input", f"输入被内容安全拦截: {in_dec.reason}")
        try:
            self._quota.check(caller_id, policy)
        except QuotaExceeded as e:
            REQUESTS_REJECTED.labels(f"quota_{e.scope}").inc()
            raise RequestRejected(429, f"quota_{e.scope}", str(e), retry_after=e.retry_after) from e

    async def stream(
        self,
        *,
        caller_id: str,
        messages: list[ChatMessage],
        model: str,
        policy: QuotaPolicy,
        max_tokens: int = 256,
        request_id: str | None = None,
    ):
        """流式编排。假设 precheck() 已通过(输入安全+配额预检)。

        yields StreamPiece:
          - delta: 已经句界缓冲-放行审核(必要时脱敏)的内容块
          - done : 正常结束,带最终 usage/配额
          - error: 失败(inference_* / safety_output),同时结束

        配额回写在流结束后执行;usage 取自最后一个 chunk,
        若客户端中途断开拿不到 usage,则用已流出字符估算,避免配额漏计。
        """
        request_id = request_id or new_request_id()
        t0 = time.perf_counter()
        route = "/v1/chat/completions"
        moderator = StreamingModerator(self._safety)
        input_action = "allow"
        output_action = "allow"
        input_tokens = 0
        output_tokens = 0
        streamed_chars = 0
        status = "ok"
        error_type = None

        # 外层 span(手动 enter/exit,跨 yield 保持 active,使 finally 里的日志能拿到 trace_id)
        _span = tracing.span(
            "chat.stream.request",
            **{
                "ultralisk.request_id": request_id,
                "ultralisk.model": model,
                "ultralisk.caller_id": caller_id,
            },
        )
        _span.__enter__()
        try:
            infer_req = InferenceRequest(
                messages=messages, model=model, max_tokens=max_tokens, stream=True, request_id=request_id
            )
            try:
                async for chunk in self._backend.stream(infer_req):
                    if chunk.delta:
                        streamed_chars += len(chunk.delta)
                        dec = moderator.feed(chunk.delta)
                        if not dec.allowed:
                            output_action = "block"
                            REQUESTS_REJECTED.labels("safety_output").inc()
                            status, error_type = "error", "safety_output"
                            yield StreamPiece(error="safety_output", done=True)
                            return
                        if dec.categories:
                            output_action = "redact"
                            for cat in dec.categories:
                                SAFETY_HITS.labels("output", cat).inc()
                        if dec.text:
                            yield StreamPiece(delta=dec.text)
                    if chunk.usage:
                        input_tokens = chunk.usage.input_tokens
                        output_tokens = chunk.usage.output_tokens
                final = moderator.flush()
                if not final.allowed:
                    output_action = "block"
                    REQUESTS_REJECTED.labels("safety_output").inc()
                    status, error_type = "error", "safety_output"
                    yield StreamPiece(error="safety_output", done=True)
                    return
                if final.categories:
                    output_action = "redact"
                    for cat in final.categories:
                        SAFETY_HITS.labels("output", cat).inc()
                if final.text:
                    yield StreamPiece(delta=final.text)
            except InferenceError as e:
                status, error_type = "error", f"inference_{e.kind}"
                REQUESTS_REJECTED.labels(f"inference_{e.kind}").inc()
                yield StreamPiece(error=error_type, done=True)
                return

            # usage 兜底:拿不到引擎 usage 时用已流出字符粗估(~4 字符/token)
            if output_tokens == 0 and streamed_chars > 0:
                output_tokens = max(1, streamed_chars // 4)
            total = input_tokens + output_tokens
            daily, monthly = self._quota.record(caller_id, total)
            TOKENS_TOTAL.labels("input").inc(input_tokens)
            TOKENS_TOTAL.labels("output").inc(output_tokens)
            yield StreamPiece(
                done=True,
                usage={
                    "prompt_tokens": input_tokens,
                    "completion_tokens": output_tokens,
                    "total_tokens": total,
                    "daily_used": daily,
                    "monthly_used": monthly,
                },
            )
        finally:
            total_ms = (time.perf_counter() - t0) * 1000
            REQUESTS_TOTAL.labels(route, "ok" if status == "ok" else "error").inc()
            if status == "ok":
                REQUEST_LATENCY.labels(route).observe(total_ms / 1000)
            log_request(
                self._log,
                request_id=request_id,
                caller_id=caller_id,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_ms=round(total_ms, 2),
                status=status,
                error_type=error_type,
                safety_input_action=input_action,
                safety_output_action=output_action,
            )
            _span.__exit__(None, None, None)
