"""FastAPI 应用工厂 + 路由(薄 HTTP 适配层)。

真正逻辑在 app/api/service.py:ChatService。此处只做:
- HTTP <-> dataclass 转换
- 从网关传入的 caller 标识读取(生产由 Kong key-auth 注入 header)
- 异常映射到 HTTP 状态码 + Retry-After(对应 AGENTS.md 验收标准)
- 暴露 /metrics(网关/应用层指标)与 /healthz
"""
from __future__ import annotations

import json

from fastapi import FastAPI, Header, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from app.api.service import ChatService, RequestRejected
from app.config import get_settings
from app.inference.base import ChatMessage, build_backend
from app.logging_config import configure_logging
from app.metrics import metrics_response
from app.quota.service import QuotaPolicy, build_quota_service
from app.safety.pipeline import build_safety_pipeline
from app.tracing import configure_tracing


class Msg(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    model: str | None = None
    messages: list[Msg]
    max_tokens: int = 256
    stream: bool = False


def create_app() -> FastAPI:
    settings = get_settings()
    logger = configure_logging(settings.log_level)
    configure_tracing(settings)  # 可选 OTel;未启用/未装依赖时 no-op
    app = FastAPI(title="Ultralisk Infra Gateway", version="0.1.0")

    # 可选:自动为 FastAPI 请求打 HTTP server span
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        if settings.tracing_enabled:
            FastAPIInstrumentor.instrument_app(app)
    except Exception:
        pass

    service = ChatService(
        backend=build_backend(settings),
        quota=build_quota_service(settings),
        safety=build_safety_pipeline(settings),
        logger=logger,
    )
    app.state.settings = settings

    @app.get("/healthz")
    async def healthz():
        return {"status": "ok", "backend": settings.inference_backend}

    @app.get("/metrics")
    async def metrics():
        body, content_type = metrics_response()
        return Response(content=body, media_type=content_type)

    @app.post("/v1/chat/completions")
    async def chat(
        body: ChatRequest,
        request: Request,
        # 生产:Kong key-auth 校验后注入调用方标识;本地可手动传。
        x_consumer_id: str | None = Header(default=None, alias="X-Consumer-ID"),
    ):
        caller_id = x_consumer_id or "anonymous"
        policy = QuotaPolicy(
            daily_token_quota=settings.default_daily_token_quota,
            monthly_token_quota=settings.default_monthly_token_quota,
        )
        chat_messages = [ChatMessage(m.role, m.content) for m in body.messages]
        model = body.model or settings.model_name

        # 流式:先同步预检(输入安全+配额),通过后才返回 200 SSE 流
        if body.stream:
            prompt = "\n".join(m.content for m in chat_messages)
            try:
                service.precheck(caller_id, prompt, policy)
            except RequestRejected as e:
                headers = {"Retry-After": str(e.retry_after)} if e.retry_after else {}
                return JSONResponse(
                    status_code=e.status,
                    content={"error": {"reason": e.reason, "message": e.message}},
                    headers=headers,
                )

            async def event_stream():
                async for piece in service.stream(
                    caller_id=caller_id,
                    messages=chat_messages,
                    model=model,
                    policy=policy,
                    max_tokens=body.max_tokens,
                ):
                    if piece.error:
                        yield f"data: {json.dumps({'error': piece.error}, ensure_ascii=False)}\n\n"
                        yield "data: [DONE]\n\n"
                    elif piece.done:
                        yield f"data: {json.dumps({'usage': piece.usage}, ensure_ascii=False)}\n\n"
                        yield "data: [DONE]\n\n"
                    else:
                        chunk = {"choices": [{"delta": {"content": piece.delta}}]}
                        yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"

            return StreamingResponse(event_stream(), media_type="text/event-stream")

        try:
            result = await service.handle(
                caller_id=caller_id,
                messages=chat_messages,
                model=model,
                policy=policy,
                max_tokens=body.max_tokens,
            )
        except RequestRejected as e:
            headers = {"Retry-After": str(e.retry_after)} if e.retry_after else {}
            return JSONResponse(
                status_code=e.status,
                content={"error": {"reason": e.reason, "message": e.message}},
                headers=headers,
            )
        return {
            "id": result.request_id,
            "model": result.model,
            "choices": [{"message": {"role": "assistant", "content": result.text}}],
            "usage": {
                "prompt_tokens": result.input_tokens,
                "completion_tokens": result.output_tokens,
                "total_tokens": result.input_tokens + result.output_tokens,
            },
            "quota": {"daily_used": result.daily_used, "monthly_used": result.monthly_used},
        }

    return app


app = create_app()
