# Ultralisk

生产级开源大模型对外 API 服务的**工程基础设施层**。与推理引擎(vLLM / TGI / SGLang)解耦,提供鉴权限流、监控、内容安全、日志四大基础能力。

- 需求与验收标准:[AGENTS.md](AGENTS.md)
- 技术选型与落地说明:[docs/tech-stack.md](docs/tech-stack.md)

## 技术栈(已敲定)

| 层 | 选型 |
|---|---|
| API 网关(鉴权 + QPS 限流) | **Kong**(声明式配置,key-auth + rate-limiting 插件) |
| 自建服务(配额 / 审核旁路 / 中间件) | **Python + FastAPI** |
| 限流 / 短期计数 | Redis |
| 长期配额 | PostgreSQL |
| 监控 | Prometheus + Grafana + Alertmanager |
| 日志 | JSON 结构化 + OpenTelemetry 规范,采集到 Loki |
| 内容安全 | 可插拔接口,先接开源(DFA 规则引擎 + Llama Guard/Qwen),预留第三方 adapter |

## 架构

```
用户 → [Kong 网关: 鉴权+QPS限流(Redis)]
     → [FastAPI 应用]
         ├─ 输入安全检测(规则引擎同步 + 审核模型)
         ├─ 推理后端(可插拔: mock / vLLM / TGI / SGLang)
         ├─ 输出安全检测
         └─ token 配额回写(Redis 当日 + PG 当月)
     → 返回用户
[Prometheus 抓取 vLLM + 网关/应用 /metrics] → Grafana + Alertmanager
[结构化 JSON 日志 + request_id] → Fluent Bit → Loki
```

## 目录结构

```
app/
  config.py              # 配置
  logging_config.py      # JSON 结构化日志 + request_id
  metrics.py             # 应用/网关层 Prometheus 指标
  main.py                # FastAPI 应用工厂
  api/routes.py          # /v1/chat/completions 全链路编排
  inference/             # 可插拔推理后端(base + mock)
  quota/                 # token 配额服务(日 Redis + 月 PG 写穿,store 可插拔)
  safety/                # 可插拔内容安全(base + DFA 规则 + adapter 占位)
gateway/kong/kong.yml    # Kong 声明式配置
monitoring/              # prometheus / alertmanager 配置
docs/log-schema.md       # 日志字段 schema
tests/                   # 验收测试(纯 Python,无需外部服务)
docker-compose.yml       # Kong + Redis + PG + Prometheus + Grafana 一键起
```

## 快速开始

```bash
# 1. 装依赖(建议 venv)
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. 跑核心单元测试(不依赖外部服务)
pytest -q

# 3. 本地起 FastAPI(mock 推理后端)
uvicorn app.main:app --reload --port 8000

# 3b. 接真实 vLLM(OpenAI 兼容端点,支持流式)
INFERENCE_BACKEND=vllm INFERENCE_BASE_URL=http://localhost:8001 \
  MODEL_NAME=Qwen/Qwen2.5-7B-Instruct uvicorn app.main:app --port 8000

# 非流式: curl -X POST .../v1/chat/completions -d '{"messages":[...]}'
# 流式(SSE): 同上加 "stream": true,返回 text/event-stream

# 4. 完整基础设施(Kong + Redis + PG + Prometheus + Grafana)
docker-compose up -d
```

## 设计原则

- **推理引擎解耦**:所有推理走 `app/inference/base.py:InferenceBackend` 接口,换 vLLM/TGI 只加一个 adapter。已内置 `mock` 与 `openai_compat`(vLLM/TGI/SGLang 共用 OpenAI 兼容端点)。
- **审核可插拔**:`app/safety/base.py` 定义 InputGuard/OutputGuard(同步规则)与 AsyncGuard(异步审核模型)。通用审核 adapter `ModelModerationGuard` 接任意 OpenAI 兼容审核端点(Llama Guard/Qwen),异步不阻塞事件循环。流式输出用**句界缓冲-放行**(`app/safety/streaming.py`)仅规则引擎;非流式额外走审核模型(补 BLOCK 路径)。
- **配额 store 抽象**:测试用内存实现,生产日计数用 Redis、月计数 PG 写穿(崩溃不丢),不改业务代码。
- **测试不依赖外部服务**:核心逻辑纯 Python,`pytest` 直接跑绿。
