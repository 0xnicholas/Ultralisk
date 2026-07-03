"""通用审核模型 adapter(OpenAI 兼容端点)。

设计(本次讨论结论:异步 guard + 通用 adapter):
- 只要是 OpenAI 兼容的审核端点(Llama Guard / Qwen 审核 / 自定义)都能接,配置切换。
- 异步 httpx 调用,不阻塞事件循环;补上 BLOCK 路径(规则引擎只 REDACT)。
- 解析策略可插拔:默认 Llama Guard 格式("safe" / "unsafe\\n<类别>")。

失败策略(fail_open):
- 审核服务不可用时,fail_open=True 放行(可用性优先,记 ERROR + metric);
  fail_open=False 则拦截(安全优先,但审核宕机会阻断全部流量)。
- 默认 fail_open=True。⚠️ 合规场景可能要求 fail-closed,上线前确认(见 docs)。
"""
from __future__ import annotations

from typing import Callable

import httpx

from app.safety.base import Action, AsyncGuard, GuardResult


def parse_llama_guard(content: str) -> GuardResult:
    """Llama Guard 输出: 首行 'safe' 或 'unsafe',unsafe 时后续行为类别(如 S1,S2)。"""
    text = (content or "").strip()
    first = text.splitlines()[0].strip().lower() if text else ""
    if first.startswith("unsafe"):
        categories = []
        lines = text.splitlines()
        if len(lines) > 1:
            # 类别可能在第二行,逗号或空格分隔
            raw = lines[1].replace(",", " ").split()
            categories = [c.strip() for c in raw if c.strip()]
        return GuardResult(Action.BLOCK, ["model:" + c for c in categories] or ["model:unsafe"], "审核模型判定 unsafe")
    return GuardResult(Action.ALLOW)


class ModelModerationGuard(AsyncGuard):
    def __init__(
        self,
        base_url: str,
        model: str,
        api_key: str = "",
        timeout: float = 10.0,
        fail_open: bool = True,
        parse_fn: Callable[[str], GuardResult] = parse_llama_guard,
        name: str = "model-moderation",
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.name = name
        self._model = model
        self._fail_open = fail_open
        self._parse = parse_fn
        self._base_url = base_url.rstrip("/")
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self._client = client or httpx.AsyncClient(base_url=self._base_url, headers=headers, timeout=timeout)

    async def acheck(self, text: str) -> GuardResult:
        payload = {
            "model": self._model,
            "messages": [{"role": "user", "content": text}],
            "max_tokens": 32,
            "temperature": 0,
        }
        try:
            resp = await self._client.post("/v1/chat/completions", json=payload)
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
        except Exception as e:
            return self._on_failure(e)
        return self._parse(content)

    def _on_failure(self, err: Exception) -> GuardResult:
        if self._fail_open:
            # 放行但标注:上层可据 categories 记 ERROR/metric
            return GuardResult(Action.ALLOW, ["model:unavailable"], f"审核模型不可用(fail-open 放行): {err}")
        return GuardResult(Action.BLOCK, ["model:unavailable"], f"审核模型不可用(fail-closed 拦截): {err}")

    async def aclose(self) -> None:
        await self._client.aclose()
