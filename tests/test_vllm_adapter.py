"""模块二/推理层验收:OpenAI 兼容 adapter(vLLM/TGI/SGLang)。

用 httpx.MockTransport 模拟引擎响应,不需真 GPU:
- 正常响应解析 + 精确 usage 接入
- 错误映射(上下文超长/4xx/5xx/超时)
"""
import asyncio

import httpx
import pytest

from app.inference.base import InferenceError, ChatMessage, InferenceRequest
from app.inference.openai_compat import OpenAICompatBackend


def make_backend(handler):
    transport = httpx.MockTransport(handler)
    client = httpx.AsyncClient(base_url="http://vllm:8000", transport=transport)
    return OpenAICompatBackend(base_url="http://vllm:8000", model="test-model", client=client)


def run(coro):
    return asyncio.run(coro)


def req(content="hello"):
    return InferenceRequest(messages=[ChatMessage("user", content)], model="test-model", request_id="rid-1")


def test_parses_response_and_exact_usage():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/chat/completions"
        return httpx.Response(
            200,
            json={
                "model": "test-model",
                "choices": [{"message": {"role": "assistant", "content": "world"}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 11, "completion_tokens": 7, "total_tokens": 18},
            },
        )

    backend = make_backend(handler)
    resp = run(backend.generate(req()))
    assert resp.text == "world"
    # 精确 usage 来自引擎,而非估算
    assert resp.usage.input_tokens == 11
    assert resp.usage.output_tokens == 7
    assert resp.usage.total_tokens == 18
    assert resp.meta["finish_reason"] == "stop"


def test_context_length_error_maps_to_400():
    def handler(request):
        return httpx.Response(
            400,
            json={"error": {"message": "This model's maximum context length is 4096 tokens", "type": "BadRequestError"}},
        )

    backend = make_backend(handler)
    with pytest.raises(InferenceError) as ei:
        run(backend.generate(req()))
    assert ei.value.kind == "context_length"
    assert ei.value.status == 400


def test_generic_bad_request_maps_to_400():
    def handler(request):
        return httpx.Response(400, json={"error": {"message": "invalid request"}})

    backend = make_backend(handler)
    with pytest.raises(InferenceError) as ei:
        run(backend.generate(req()))
    assert ei.value.kind == "bad_request"


def test_5xx_maps_to_upstream_error():
    def handler(request):
        return httpx.Response(503, text="service unavailable")

    backend = make_backend(handler)
    with pytest.raises(InferenceError) as ei:
        run(backend.generate(req()))
    assert ei.value.kind == "upstream_error"
    assert ei.value.status == 502


def test_timeout_maps_to_504():
    def handler(request):
        raise httpx.TimeoutException("timed out")

    backend = make_backend(handler)
    with pytest.raises(InferenceError) as ei:
        run(backend.generate(req()))
    assert ei.value.kind == "timeout"
    assert ei.value.status == 504


def test_malformed_response_maps_to_upstream_error():
    def handler(request):
        return httpx.Response(200, json={"unexpected": "shape"})

    backend = make_backend(handler)
    with pytest.raises(InferenceError) as ei:
        run(backend.generate(req()))
    assert ei.value.kind == "upstream_error"
