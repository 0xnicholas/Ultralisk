"""内容安全可插拔接口。

设计(见 docs/tech-stack.md 模块三):
- InputGuard:请求进入推理前执行(格式/长度校验、Prompt Injection 检测)。
- OutputGuard:推理结果返回用户前执行(敏感词/违规过滤)。
- 规则引擎同步跑(毫秒级),审核模型/第三方作为可插拔 adapter(可异步/流式)。
- 命中即记录日志,便于后续迭代规则。
"""
from __future__ import annotations

import abc
from dataclasses import dataclass, field
from enum import Enum


class Action(str, Enum):
    ALLOW = "allow"
    BLOCK = "block"
    REDACT = "redact"  # 替换命中片段后放行


@dataclass
class GuardResult:
    action: Action
    # 命中的规则/类别,用于审核命中日志
    categories: list[str] = field(default_factory=list)
    reason: str = ""
    # REDACT 时的处理后文本;BLOCK/ALLOW 时为 None
    sanitized_text: str | None = None

    @property
    def allowed(self) -> bool:
        return self.action != Action.BLOCK


class InputGuard(abc.ABC):
    name: str = "input-guard"

    @abc.abstractmethod
    def check(self, text: str) -> GuardResult: ...


class OutputGuard(abc.ABC):
    name: str = "output-guard"

    @abc.abstractmethod
    def check(self, text: str) -> GuardResult: ...


class AsyncGuard(abc.ABC):
    """异步 guard(审核模型/第三方 API)。模型是 IO 调用,走异步不阻塞事件循环。

    同一实现可同时用于输入与输出侧(如 Llama Guard)。
    """

    name: str = "async-guard"

    @abc.abstractmethod
    async def acheck(self, text: str) -> GuardResult: ...
