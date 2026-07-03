"""可插拔推理后端。

所有推理调用都走 InferenceBackend 接口,换 vLLM/TGI/SGLang 只需新增 adapter,
业务/审核/配额层不感知具体引擎。
"""
from __future__ import annotations

import abc
from dataclasses import dataclass, field
from typing import AsyncIterator


@dataclass
class ChatMessage:
    role: str
    content: str


@dataclass
class InferenceRequest:
    messages: list[ChatMessage]
    model: str
    max_tokens: int = 256
    temperature: float = 0.7
    stream: bool = False
    request_id: str = ""


@dataclass
class TokenUsage:
    input_tokens: int = 0
    output_tokens: int = 0

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens


@dataclass
class InferenceResponse:
    text: str
    usage: TokenUsage
    model: str
    # 引擎级指标(TTFT/TPOT 由推理引擎自身通过 Prometheus 暴露,此处仅记录端到端便于日志)
    meta: dict = field(default_factory=dict)


@dataclass
class StreamChunk:
    """流式增量块。usage 仅在最后一个 chunk 出现(需 stream_options.include_usage)。"""

    delta: str = ""
    usage: "TokenUsage | None" = None
    finish_reason: "str | None" = None


class InferenceError(Exception):
    """推理后端错误,携带分类与建议 HTTP 状态码,便于错误映射与监控细分。

    kind: context_length | bad_request | timeout | upstream_error
    """

    def __init__(self, kind: str, message: str, status: int = 502) -> None:
        self.kind = kind
        self.status = status
        super().__init__(message)


class InferenceBackend(abc.ABC):
    """推理后端抽象。生产实现应仅封装 HTTP 调用,不含业务逻辑。"""

    name: str = "abstract"

    @abc.abstractmethod
    async def generate(self, req: InferenceRequest) -> InferenceResponse:
        ...

    async def stream(self, req: InferenceRequest) -> AsyncIterator["StreamChunk"]:
        """默认流式实现:退化为一次性生成后单块吐出(保留 usage),子类可覆盖为真流式。"""
        resp = await self.generate(req)
        yield StreamChunk(delta=resp.text, usage=resp.usage, finish_reason=resp.meta.get("finish_reason"))


def build_backend(settings) -> InferenceBackend:
    """根据配置构造后端。新增引擎时在此注册 adapter。"""
    kind = settings.inference_backend
    if kind == "mock":
        from app.inference.mock import MockBackend

        return MockBackend()
    if kind in ("vllm", "tgi", "sglang"):
        # vLLM/TGI/SGLang 均提供 OpenAI 兼容端点,共用同一 adapter。
        from app.inference.openai_compat import OpenAICompatBackend

        return OpenAICompatBackend(
            base_url=settings.inference_base_url,
            model=settings.model_name,
            api_key=settings.inference_api_key,
            timeout=settings.inference_timeout,
            name=kind,
        )
    raise ValueError(f"未知推理后端: {kind!r}")
