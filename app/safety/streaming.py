"""流式输出审核:句界缓冲-放行(sentence-boundary buffer-and-release)。

策略(本次讨论结论):字节边生成边发,发出去收不回,因此不能整体脱敏。
做法:按标点/换行为边界缓冲,凑齐完整句子后跑输出 guard(毫秒级),
干净/脱敏后才放行,命中可拦在用户之前。流结束时 flush 剩余缓冲。

- REDACT:命中敏感词 -> 放行脱敏后的文本。
- BLOCK:命中不可放行内容 -> 停止流,交由上层输出安全提示。
"""
from __future__ import annotations

from app.safety.pipeline import SafetyDecision, SafetyPipeline

# 句界:中英文常见句末标点 + 换行。分号可选,避免半句滞留过久。
_DEFAULT_BOUNDARY = "。！？!?…\n；;"


class StreamingModerator:
    def __init__(self, pipeline: SafetyPipeline, boundary: str = _DEFAULT_BOUNDARY, max_buffer: int = 400) -> None:
        self._pipeline = pipeline
        self._boundary = set(boundary)
        self._buf = ""
        self._max_buffer = max_buffer  # 防止无标点长文本无限滞留
        self.hit_categories: list[str] = []

    def _split_at_last_boundary(self) -> tuple[str, str]:
        last = -1
        for i, ch in enumerate(self._buf):
            if ch in self._boundary:
                last = i
        if last == -1:
            # 无句界:缓冲超上限则强制放行,避免延迟累积/内存增长
            if len(self._buf) >= self._max_buffer:
                return self._buf, ""
            return "", self._buf
        return self._buf[: last + 1], self._buf[last + 1 :]

    def feed(self, delta: str) -> SafetyDecision:
        """喂入增量,返回本次可放行(已脱敏)的文本决策;未凑齐句子则 text 为空。"""
        self._buf += delta
        complete, remainder = self._split_at_last_boundary()
        self._buf = remainder
        if not complete:
            return SafetyDecision(True, "", stage="output")
        return self._moderate(complete)

    def flush(self) -> SafetyDecision:
        """流结束:审核并放行剩余缓冲。"""
        if not self._buf:
            return SafetyDecision(True, "", stage="output")
        text = self._buf
        self._buf = ""
        return self._moderate(text)

    def _moderate(self, text: str) -> SafetyDecision:
        dec = self._pipeline.check_output(text)
        if dec.categories:
            self.hit_categories += dec.categories
        return dec
