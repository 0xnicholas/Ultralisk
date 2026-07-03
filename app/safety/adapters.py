"""审核模型 / 第三方审核 adapter 占位。

当前项目决策:先用开源方案跑通(规则引擎 + 审核模型),预留第三方接入位。
生产落地时补齐:
- LlamaGuardGuard: 调用自部署 Llama Guard / Qwen 审核模型(HTTP)。
- ThirdPartyGuard: 调用阿里云内容安全 / 腾讯云天御(合规资质)。

注意(见 docs/tech-stack.md 模块三):
- 审核模型是一次额外推理调用,会叠加延迟 —— 生产建议异步/流式边出边审。
- 面向国内用户很可能有强制合规要求,自建模型不能替代有资质第三方。
"""
from __future__ import annotations

from app.safety.base import Action, GuardResult, InputGuard, OutputGuard


class LlamaGuardGuard(InputGuard, OutputGuard):
    """自部署审核模型 adapter 占位。接入时实现 HTTP 调用。"""

    name = "llama-guard"

    def __init__(self, base_url: str = "", model: str = "llama-guard") -> None:
        self._base_url = base_url
        self._model = model

    def check(self, text: str) -> GuardResult:  # pragma: no cover - 占位
        raise NotImplementedError(
            "Llama Guard adapter 未实现:请封装对自部署审核模型的 HTTP 调用,"
            "返回 GuardResult(action, categories)。"
        )


class ThirdPartyGuard(InputGuard, OutputGuard):
    """有资质第三方审核(阿里云/腾讯云)adapter 占位。合规场景优先。"""

    name = "third-party"

    def __init__(self, provider: str = "", credentials: dict | None = None) -> None:
        self._provider = provider
        self._credentials = credentials or {}

    def check(self, text: str) -> GuardResult:  # pragma: no cover - 占位
        raise NotImplementedError(
            "第三方审核 adapter 未实现:按合规要求接入对应厂商 SDK/API。"
        )


class NoopGuard(InputGuard, OutputGuard):
    """禁用审核时的空实现(始终放行)。"""

    name = "noop"

    def check(self, text: str) -> GuardResult:
        return GuardResult(Action.ALLOW)
