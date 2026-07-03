"""JSON 结构化日志 + request_id 全链路字段。

对应 AGENTS.md 模块四:每次请求记录 request_id / caller / 耗时拆分 /
模型版本 / token 用量 / 错误。字段 schema 见 docs/log-schema.md。

- 输出 JSON 便于 Fluent Bit 采集、Loki/ES 聚合。
- request_id 用 OTel 兼容命名,后续接 OpenTelemetry 可平滑对接。
- PII 脱敏与保留周期属于策略,由采集/存储侧执行(见 docs/log-schema.md 待确认项)。
"""
from __future__ import annotations

import json
import logging
import sys
import uuid
from datetime import datetime, timezone

# 每次请求应记录的字段(与 docs/log-schema.md 保持一致)
REQUEST_LOG_FIELDS = [
    "request_id",
    "trace_id",
    "span_id",
    "caller_id",
    "model",
    "input_tokens",
    "output_tokens",
    "queue_ms",
    "inference_ms",
    "total_ms",
    "status",
    "error_type",
    "safety_input_action",
    "safety_output_action",
]


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        # 附加 extra 字段
        for key, value in getattr(record, "__dict__", {}).items():
            if key in ("args", "msg", "levelname", "levelno", "name", "pathname",
                       "filename", "module", "exc_info", "exc_text", "stack_info",
                       "lineno", "funcName", "created", "msecs", "relativeCreated",
                       "thread", "threadName", "processName", "process", "taskName"):
                continue
            payload[key] = value
        if record.exc_info:
            payload["error_stack"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def new_request_id() -> str:
    return uuid.uuid4().hex


def configure_logging(level: str = "INFO") -> logging.Logger:
    logger = logging.getLogger("ultralisk")
    logger.setLevel(level.upper())
    logger.handlers.clear()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    logger.addHandler(handler)
    logger.propagate = False
    return logger


def log_request(logger: logging.Logger, **fields) -> None:
    """记录一条请求级结构化日志。未提供的字段留空,便于下游对齐 schema。

    若未显式传 trace_id/span_id,自动从当前 OTel span 提取(未启用则为 None)。
    """
    if fields.get("trace_id") is None and fields.get("span_id") is None:
        try:
            from app.tracing import current_ids

            trace_id, span_id = current_ids()
            fields.setdefault("trace_id", trace_id)
            fields.setdefault("span_id", span_id)
        except Exception:
            pass
    record = {k: fields.get(k) for k in REQUEST_LOG_FIELDS}
    record.update({k: v for k, v in fields.items() if k not in record})
    status = record.get("status", "ok")
    level = logging.ERROR if status == "error" else logging.INFO
    logger.log(level, "request", extra=record)
