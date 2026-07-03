"""DFA 敏感词规则引擎 + 基础输入校验。

规则引擎作为内容安全第一层(同步、毫秒级),兜底审核模型漏网/延迟。
DFA(确定有限自动机)一次遍历文本即可匹配多敏感词,O(n) 复杂度。
"""
from __future__ import annotations

import re

from app.safety.base import Action, GuardResult, InputGuard, OutputGuard

_END = "\x00"  # DFA 终止标记


class DFAFilter:
    """多敏感词一次遍历匹配。大小写不敏感,忽略词间常见分隔符。"""

    def __init__(self, words: list[str] | None = None) -> None:
        self._root: dict = {}
        for w in words or []:
            self.add(w)

    def add(self, word: str) -> None:
        word = word.strip().lower()
        if not word:
            return
        node = self._root
        for ch in word:
            node = node.setdefault(ch, {})
        node[_END] = True

    def find(self, text: str) -> list[str]:
        """返回命中的敏感词列表(去重,保持首次出现顺序)。"""
        text_l = text.lower()
        hits: list[str] = []
        seen: set[str] = set()
        n = len(text_l)
        for i in range(n):
            node = self._root
            j = i
            while j < n and text_l[j] in node:
                node = node[text_l[j]]
                if _END in node:
                    word = text_l[i : j + 1]
                    if word not in seen:
                        seen.add(word)
                        hits.append(word)
                j += 1
        return hits

    def redact(self, text: str, mask: str = "*") -> tuple[str, list[str]]:
        """将命中片段替换为掩码,返回 (处理后文本, 命中词)。"""
        hits = self.find(text)
        out = text
        for w in hits:
            out = re.sub(re.escape(w), mask * len(w), out, flags=re.IGNORECASE)
        return out, hits


# 内置最小示例词库/规则(生产应从配置/词库文件加载,并接入合规第三方)。
_DEFAULT_SENSITIVE_WORDS = ["敏感词示例", "违规内容示例"]

# Prompt Injection / 越狱类启发式规则(示例;生产建议叠加 Rebuff/审核模型)。
_INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(all\s+)?previous\s+instructions", re.IGNORECASE),
    re.compile(r"忽略(上面|之前|以上)(所有)?(的)?(指令|指示|提示)"),
    re.compile(r"(reveal|print|show|输出|泄露|打印).{0,12}(system\s*prompt|系统提示词|系统提示)", re.IGNORECASE),
    re.compile(r"you\s+are\s+now\s+in\s+(dan|developer)\s+mode", re.IGNORECASE),
]


class RuleInputGuard(InputGuard):
    """输入侧:长度/重复校验 + Prompt Injection 启发式 + 敏感词。"""

    name = "rule-input-guard"

    def __init__(
        self,
        sensitive_words: list[str] | None = None,
        max_chars: int = 8000,
        max_repeat_ratio: float = 0.6,
    ) -> None:
        self._dfa = DFAFilter(sensitive_words if sensitive_words is not None else _DEFAULT_SENSITIVE_WORDS)
        self._max_chars = max_chars
        self._max_repeat_ratio = max_repeat_ratio

    def _looks_like_flooding(self, text: str) -> bool:
        """异常重复检测:单字符占比过高,疑似攻击性 payload。"""
        if len(text) < 50:
            return False
        most = max((text.count(c) for c in set(text)), default=0)
        return most / len(text) >= self._max_repeat_ratio

    def check(self, text: str) -> GuardResult:
        if len(text) > self._max_chars:
            return GuardResult(Action.BLOCK, ["input.too_long"], f"输入超长 {len(text)}>{self._max_chars}")
        if self._looks_like_flooding(text):
            return GuardResult(Action.BLOCK, ["input.flooding"], "异常重复输入")
        for pat in _INJECTION_PATTERNS:
            if pat.search(text):
                return GuardResult(Action.BLOCK, ["prompt_injection"], f"命中越狱模式: {pat.pattern[:40]}")
        hits = self._dfa.find(text)
        if hits:
            return GuardResult(Action.BLOCK, ["sensitive_word"], f"命中敏感词: {hits}")
        return GuardResult(Action.ALLOW)


class RuleOutputGuard(OutputGuard):
    """输出侧:敏感词命中则脱敏(REDACT),而非直接透传。"""

    name = "rule-output-guard"

    def __init__(self, sensitive_words: list[str] | None = None) -> None:
        self._dfa = DFAFilter(sensitive_words if sensitive_words is not None else _DEFAULT_SENSITIVE_WORDS)

    def check(self, text: str) -> GuardResult:
        sanitized, hits = self._dfa.redact(text)
        if hits:
            return GuardResult(Action.REDACT, ["sensitive_word"], f"输出命中并脱敏: {hits}", sanitized_text=sanitized)
        return GuardResult(Action.ALLOW)
