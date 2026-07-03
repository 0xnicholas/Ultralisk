"""内容安全流水线:编排多个 guard,串联执行。

规则引擎在前(同步快过滤),审核模型/第三方在后(可插拔)。
命中即产出结构化审核日志条目,交由日志层落库。
"""
from __future__ import annotations

from dataclasses import dataclass, field

from app.safety.base import Action, AsyncGuard, GuardResult, InputGuard, OutputGuard


@dataclass
class SafetyDecision:
    allowed: bool
    text: str  # 放行/脱敏后的文本(输出侧可能被改写)
    categories: list[str] = field(default_factory=list)
    reason: str = ""
    stage: str = ""  # "input" | "output"
    guard: str = ""  # 命中的 guard 名


class SafetyPipeline:
    def __init__(
        self,
        input_guards: list[InputGuard] | None = None,
        output_guards: list[OutputGuard] | None = None,
        input_model_guards: list[AsyncGuard] | None = None,
        output_model_guards: list[AsyncGuard] | None = None,
    ) -> None:
        self._input_guards = input_guards or []
        self._output_guards = output_guards or []
        # 异步审核模型 guard(仅非流式路径使用;流式仍只用规则引擎)
        self._input_model_guards = input_model_guards or []
        self._output_model_guards = output_model_guards or []

    def check_input(self, text: str) -> SafetyDecision:
        """同步:仅规则引擎(流式 precheck / 快速路径用)。"""
        for g in self._input_guards:
            res: GuardResult = g.check(text)
            if res.action == Action.BLOCK:
                return SafetyDecision(False, text, res.categories, res.reason, "input", g.name)
            if res.action == Action.REDACT and res.sanitized_text is not None:
                text = res.sanitized_text
        return SafetyDecision(True, text, stage="input")

    def check_output(self, text: str) -> SafetyDecision:
        """同步:仅规则引擎(流式句界缓冲用)。"""
        categories: list[str] = []
        guard_name = ""
        for g in self._output_guards:
            res: GuardResult = g.check(text)
            if res.action == Action.BLOCK:
                return SafetyDecision(False, text, res.categories, res.reason, "output", g.name)
            if res.action == Action.REDACT and res.sanitized_text is not None:
                text = res.sanitized_text
                categories += res.categories
                guard_name = g.name
        return SafetyDecision(True, text, categories, stage="output", guard=guard_name)

    async def acheck_input(self, text: str) -> SafetyDecision:
        """异步:规则引擎先跑(快，可 BLOCK),再 await 审核模型(BLOCK on unsafe)。"""
        dec = self.check_input(text)
        if not dec.allowed:
            return dec
        text = dec.text
        for g in self._input_model_guards:
            res = await g.acheck(text)
            if res.action == Action.BLOCK:
                return SafetyDecision(False, text, res.categories, res.reason, "input", g.name)
        return SafetyDecision(True, text, stage="input")

    async def acheck_output(self, text: str) -> SafetyDecision:
        """异步:规则引擎脱敏在前,再 await 审核模型(BLOCK on unsafe)。"""
        dec = self.check_output(text)
        if not dec.allowed:
            return dec
        text = dec.text
        categories = list(dec.categories)
        for g in self._output_model_guards:
            res = await g.acheck(text)
            if res.action == Action.BLOCK:
                return SafetyDecision(False, text, res.categories, res.reason, "output", g.name)
            if res.categories:
                categories += res.categories
        return SafetyDecision(True, text, categories, stage="output")


def build_safety_pipeline(settings) -> SafetyPipeline:
    """按配置组装。规则引擎默认开;审核模型可选(仅非流式路径生效)。"""
    if not settings.safety_enabled:
        return SafetyPipeline([], [])
    from app.safety.rules import RuleInputGuard, RuleOutputGuard

    input_model_guards = []
    output_model_guards = []
    if getattr(settings, "safety_model_enabled", False):
        from app.safety.model_guard import ModelModerationGuard

        guard = ModelModerationGuard(
            base_url=settings.safety_model_base_url,
            model=settings.safety_model_name,
            api_key=settings.safety_model_api_key,
            timeout=settings.safety_model_timeout,
            fail_open=settings.safety_model_fail_open,
        )
        input_model_guards = [guard]
        output_model_guards = [guard]

    return SafetyPipeline(
        input_guards=[RuleInputGuard(max_chars=settings.max_input_chars)],
        output_guards=[RuleOutputGuard()],
        input_model_guards=input_model_guards,
        output_model_guards=output_model_guards,
    )
