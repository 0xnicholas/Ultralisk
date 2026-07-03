"""OpenAI 兼容推理后端(vLLM / TGI / SGLang 共用)。

设计要点(见本次讨论结论):
- 只封装 HTTP 调用,不含业务逻辑,保持推理引擎解耦。
- 调 /v1/chat/completions,直接使用引擎返回的**精确 usage**(不再估算),
  配额计量因此准确。
- TTFT/TPOT 等引擎级指标由引擎自身 /metrics 暴露,Prometheus 直接抓,此处不算。
- 错误映射到 InferenceError(kind + status),便于监控按错误类型细分:
    上下文超长 -> 400 context_length
    其他 4xx  -> 400 bad_request
    5xx       -> 502 upstream_error
    超时/连接失败 -> 504 timeout
- 不自动重试:LLM 请求非幂等,重试可能重复生成/计费。

当前实现非流式 generate() 与真流式 stream()(SSE)。
流式:传 stream_options.include_usage,usage 在最后一个 chunk;输出审核由
上层 StreamingModerator(句界缓冲-放行)处理,保住“违规不透传”。
"""
from __future__ import annotations

import json

import httpx

from app.inference.base import (
    InferenceBackend,
    InferenceError,
    InferenceRequest,
    InferenceResponse,
    StreamChunk,
    TokenUsage,
)


class OpenAICompatBackend(InferenceBackend):
    def __init__(
        self,
        base_url: str,
        model: str,
        api_key: str = "",
        timeout: float = 60.0,
        name: str = "vllm",
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.name = name
        self._model = model
        self._timeout = timeout
        self._base_url = base_url.rstrip("/")
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        # 允许注入 client(单测用 MockTransport);否则自建带连接池的长生命周期 client。
        self._client = client or httpx.AsyncClient(
            base_url=self._base_url,
            headers=headers,
            timeout=timeout,
        )

    async def generate(self, req: InferenceRequest) -> InferenceResponse:
        payload = {
            "model": req.model or self._model,
            "messages": [{"role": m.role, "content": m.content} for m in req.messages],
            "max_tokens": req.max_tokens,
            "temperature": req.temperature,
            "stream": False,
        }
        try:
            resp = await self._client.post("/v1/chat/completions", json=payload)
        except httpx.TimeoutException as e:
            raise InferenceError("timeout", f"推理引擎超时: {e}", status=504) from e
        except httpx.HTTPError as e:
            raise InferenceError("upstream_error", f"推理引擎连接失败: {e}", status=502) from e

        self._raise_for_status(resp)

        try:
            data = resp.json()
            choice = data["choices"][0]
            text = choice["message"]["content"] or ""
            usage_raw = data.get("usage") or {}
            usage = TokenUsage(
                input_tokens=int(usage_raw.get("prompt_tokens", 0)),
                output_tokens=int(usage_raw.get("completion_tokens", 0)),
            )
        except (KeyError, IndexError, ValueError, TypeError) as e:
            raise InferenceError("upstream_error", f"推理响应解析失败: {e}", status=502) from e

        return InferenceResponse(
            text=text,
            usage=usage,
            model=data.get("model", req.model),
            meta={
                "backend": self.name,
                "request_id": req.request_id,
                "finish_reason": choice.get("finish_reason"),
            },
        )

    async def stream(self, req: InferenceRequest):
        """真流式 SSE。逐行解析 data: {...},产出 StreamChunk(delta / 最终 usage)。"""
        payload = {
            "model": req.model or self._model,
            "messages": [{"role": m.role, "content": m.content} for m in req.messages],
            "max_tokens": req.max_tokens,
            "temperature": req.temperature,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        try:
            async with self._client.stream("POST", "/v1/chat/completions", json=payload) as resp:
                if resp.status_code >= 400:
                    await resp.aread()
                    self._raise_for_status(resp)
                async for line in resp.aiter_lines():
                    line = line.strip()
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[len("data:"):].strip()
                    if data == "[DONE]":
                        break
                    try:
                        obj = json.loads(data)
                    except ValueError:
                        continue
                    choices = obj.get("choices") or []
                    delta = ""
                    finish = None
                    if choices:
                        delta = (choices[0].get("delta") or {}).get("content") or ""
                        finish = choices[0].get("finish_reason")
                    usage = None
                    if obj.get("usage"):
                        u = obj["usage"]
                        usage = TokenUsage(
                            input_tokens=int(u.get("prompt_tokens", 0)),
                            output_tokens=int(u.get("completion_tokens", 0)),
                        )
                    if delta or usage or finish:
                        yield StreamChunk(delta=delta, usage=usage, finish_reason=finish)
        except httpx.TimeoutException as e:
            raise InferenceError("timeout", f"推理引擎超时: {e}", status=504) from e
        except httpx.HTTPError as e:
            raise InferenceError("upstream_error", f"推理引擎连接失败: {e}", status=502) from e

    def _raise_for_status(self, resp: httpx.Response) -> None:
        if resp.status_code < 400:
            return
        message = self._extract_error_message(resp)
        if resp.status_code == 400:
            # vLLM 上下文超长通常是 400,错误信息含 context length 关键词
            lowered = message.lower()
            if "context" in lowered and ("length" in lowered or "token" in lowered):
                raise InferenceError("context_length", message, status=400)
            raise InferenceError("bad_request", message, status=400)
        if 400 < resp.status_code < 500:
            raise InferenceError("bad_request", message, status=400)
        raise InferenceError("upstream_error", message, status=502)

    @staticmethod
    def _extract_error_message(resp: httpx.Response) -> str:
        try:
            body = resp.json()
        except ValueError:
            return resp.text[:500] or f"HTTP {resp.status_code}"
        # OpenAI/vLLM 错误体形态兼容: {"error": {"message": ...}} 或 {"message": ...}
        if isinstance(body, dict):
            err = body.get("error")
            if isinstance(err, dict) and err.get("message"):
                return str(err["message"])
            if isinstance(err, str):
                return err
            if body.get("message"):
                return str(body["message"])
        return f"HTTP {resp.status_code}"

    async def aclose(self) -> None:
        await self._client.aclose()
