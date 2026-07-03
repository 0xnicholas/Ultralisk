"""Mock 推理后端:无需 GPU / 外部引擎即可跑通全链路。

token 计数用简单的空白切分近似,足够验证配额回写逻辑;
真实后端应使用引擎返回的 usage 字段。
"""
from __future__ import annotations

import asyncio

from app.inference.base import (
    InferenceBackend,
    InferenceRequest,
    InferenceResponse,
    TokenUsage,
)


def approx_tokens(text: str) -> int:
    """粗略 token 估算(仅 mock 用)。真实后端以引擎 usage 为准。"""
    if not text:
        return 0
    # 近似:词数 * 1.3,至少 1
    words = len(text.split())
    return max(1, int(words * 1.3))


class MockBackend(InferenceBackend):
    name = "mock"

    async def generate(self, req: InferenceRequest) -> InferenceResponse:
        await asyncio.sleep(0)  # 让出事件循环,模拟异步 IO
        prompt = "\n".join(m.content for m in req.messages)
        reply = f"[mock:{req.model}] 收到 {len(req.messages)} 条消息,共约 {approx_tokens(prompt)} 输入 token。"
        usage = TokenUsage(
            input_tokens=approx_tokens(prompt),
            output_tokens=approx_tokens(reply),
        )
        return InferenceResponse(
            text=reply,
            usage=usage,
            model=req.model,
            meta={"backend": self.name, "request_id": req.request_id},
        )
