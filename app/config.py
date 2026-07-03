"""集中配置。

优先从环境变量读取,提供合理默认值,便于本地零配置跑通 mock 后端。
避免引入 pydantic-settings 硬依赖,使核心逻辑 stdlib 可测。
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


@dataclass
class Settings:
    # 推理后端: mock | vllm | tgi | sglang
    inference_backend: str = field(default_factory=lambda: os.environ.get("INFERENCE_BACKEND", "mock"))
    inference_base_url: str = field(default_factory=lambda: os.environ.get("INFERENCE_BASE_URL", "http://localhost:8000"))
    inference_api_key: str = field(default_factory=lambda: os.environ.get("INFERENCE_API_KEY", ""))
    inference_timeout: float = field(default_factory=lambda: float(os.environ.get("INFERENCE_TIMEOUT", "60")))
    model_name: str = field(default_factory=lambda: os.environ.get("MODEL_NAME", "mock-model-0.1"))

    # 配额 store: memory | redis | redis_pg
    quota_store: str = field(default_factory=lambda: os.environ.get("QUOTA_STORE", "memory"))
    redis_url: str = field(default_factory=lambda: os.environ.get("REDIS_URL", "redis://localhost:6379/0"))
    pg_dsn: str = field(default_factory=lambda: os.environ.get("PG_DSN", "postgresql://ultralisk:ultralisk@localhost:5432/ultralisk"))

    # 默认配额(可被分级配额覆盖)
    default_daily_token_quota: int = field(default_factory=lambda: _int("DEFAULT_DAILY_TOKEN_QUOTA", 100_000))
    default_monthly_token_quota: int = field(default_factory=lambda: _int("DEFAULT_MONTHLY_TOKEN_QUOTA", 2_000_000))

    # 内容安全
    safety_enabled: bool = field(default_factory=lambda: os.environ.get("SAFETY_ENABLED", "1") == "1")
    max_input_chars: int = field(default_factory=lambda: _int("MAX_INPUT_CHARS", 8000))

    # 审核模型(OpenAI 兼容端点;仅非流式路径生效)
    safety_model_enabled: bool = field(default_factory=lambda: os.environ.get("SAFETY_MODEL_ENABLED", "0") == "1")
    safety_model_base_url: str = field(default_factory=lambda: os.environ.get("SAFETY_MODEL_BASE_URL", "http://localhost:8002"))
    safety_model_name: str = field(
        default_factory=lambda: os.environ.get(
            "SAFETY_MODEL_NAME", "meta-llama/Llama-Guard-3-8B"
        )
    )
    safety_model_api_key: str = field(default_factory=lambda: os.environ.get("SAFETY_MODEL_API_KEY", ""))
    safety_model_timeout: float = field(default_factory=lambda: float(os.environ.get("SAFETY_MODEL_TIMEOUT", "10")))
    # fail-open: 审核服务不可用时放行(可用性优先)。⚠️ 合规场景可能需 fail-closed,上线前确认。
    safety_model_fail_open: bool = field(default_factory=lambda: os.environ.get("SAFETY_MODEL_FAIL_OPEN", "1") == "1")

    # 日志
    log_level: str = field(default_factory=lambda: os.environ.get("LOG_LEVEL", "INFO"))

    # 追踪(OpenTelemetry;默认关,未装 opentelemetry 时自动 no-op)
    tracing_enabled: bool = field(default_factory=lambda: os.environ.get("TRACING_ENABLED", "0") == "1")
    service_name: str = field(default_factory=lambda: os.environ.get("OTEL_SERVICE_NAME", "ultralisk"))
    otel_exporter: str = field(default_factory=lambda: os.environ.get("OTEL_EXPORTER", "console"))  # console | otlp
    otlp_endpoint: str = field(default_factory=lambda: os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318/v1/traces"))


def get_settings() -> Settings:
    return Settings()
