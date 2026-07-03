# Ultralisk

生产级 LLM API 基础设施层。将开源大模型(vLLM / TGI / SGLang)封装为对外服务时,提供鉴权限流、可观测性、内容安全、日志追踪四大基础能力——**与推理引擎解耦,独立可测,可插拔**。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.12%20%7C%203.13%20%7C%203.14-blue)](pyproject.toml)
[![Tests](https://img.shields.io/badge/tests-53%20passed-brightgreen)](tests/)

> 📖 需求与验收标准 → [AGENTS.md](AGENTS.md)　|　技术选型与落地坑 → [docs/tech-stack.md](docs/tech-stack.md)　|　日志字段 schema → [docs/log-schema.md](docs/log-schema.md)

---

## 为什么需要这一层?

推理引擎(vLLM/TGI)只负责 token 生成。生产对外服务还缺:

| 缺什么 | 在哪儿做 | 本项目怎么做 |
|---|---|---|
| 谁在用、用了多少 | 网关 + 配额层 | Kong key-auth + 自建 token 配额(日 Redis / 月 PG) |
| 服务还活着吗、慢不慢 | 监控层 | Prometheus(Grafana) /metrics,引擎 + 网关双源 |
| 会不会越狱/违规 | 审核层 | DFA 规则(毫秒) + 审核模型(异步),可插拔 |
| 出问题怎么查 | 日志 + 追踪 | JSON 结构化 + request_id + OTel span→Loki/Tempo |

而且这四个模块**必须与推理引擎解耦**——换 vLLM→TGI→SGLang 时不应重写鉴权、审核、配额、日志。

---

## 架构

```
客户端                        推理引擎(vLLM/TGI)
  │                                │
  ▼                                ▼
┌──────────────────────────  Prometheus  ──── Grafana + Alertmanager
│ Kong 网关                  抓三源:网关 · 应用 · 引擎
│  · key-auth (401)
│  · rate-limiting (429)     Fluent Bit → Loki
│  · Prometheus metrics
└──────┬───────────────────
       │
       ▼
┌──────────────────────────
│  FastAPI 应用 (app/)
│
│  输入安全 (规则引擎 → 审核模型)
│       │
│  配额预检 (日 Redis / 月 PG)
│       │
│  推理后端 (可插拔: mock / OpenAI 兼容)
│       │
│  输出安全 (规则引擎 REDACT → 审核模型 BLOCK)
│       │
│  配额回写 (Redis INCR + PG upsert)
│       │
│  JSON 日志 (request_id + trace_id/span_id)
└──────────────────────────
```

**非流式**:输入安全 + 配额 → 推理 → 输出安全 + 配额回写,审核模型参与输入/输出两侧。  
**流式(SSE)** :输入安全 + 配额预检(同步) → 推理 → **句界缓冲-放行**(仅规则引擎,逐句脱敏后放行) → 配额回写。

---

## 四大模块速览

### 模块一:鉴权与限流

```
Kong 网关                          app/quota/
  key-auth → 401                   service.py    日 Redis + 月 PG write-through
  rate-limiting → 429              sql_store.py  PG upsert (原子累加,崩溃不丢)
  X-Consumer-ID → header           CounterStore  可插拔: memory / Redis / PG
```

| 能力 | 位置 | 实现 |
|---|---|---|
| API Key 校验 | Kong 网关 | key-auth 插件 |
| QPS 限流(滑动窗口) | Kong 网关 | rate-limiting 插件(Redis 计数) |
| token 用量配额(按天/月) | `app/quota/` | 推理后回写:日 `INCR`+`EXPIRE`,月 `INSERT...ON CONFLICT DO UPDATE` |
| 超限 429 + Retry-After | Kong + 自建 | 需自建 token 配额(网关不知道推理返回了多少 token) |
| 分级配额 | `QuotaPolicy` + consumer | 不同调用方可配不同日/月额度 |

### 模块二:监控

```
monitoring/prometheus/             app/metrics.py
  prometheus.yml  三源抓取         应用层指标(网关抓不到的部分)
  alert.rules.yml 告警规则           · 鉴权失败 / 限流拒绝 / 配额超限
                                     · 内容安全命中(按 stage + category)
                                     · token 用量(按方向)
```

| 指标 | 来源 | 说明 |
|---|---|---|
| TTFT / TPOT / 吞吐 | vLLM `/metrics`(原生) | 零额外开发,Prometheus 直接抓 |
| GPU 利用率/显存 | vLLM + GPU exporter | |
| 请求成功率/错误率 | Kong + 应用 `/metrics` | 细分到 `safety_input`/`quota_daily`/`inference_context_length` |
| 审核命中 | 应用 `/metrics` | `safety_hits_total{stage,category}` |
| 并发/排队 | Kong prometheus 插件 | |

见 `monitoring/prometheus/alert.rules.yml` 的预设告警规则。

### 模块三:内容安全

```
app/safety/
  base.py       InputGuard / OutputGuard / AsyncGuard 接口
  rules.py      DFA 规则引擎(中英文越狱检测 + 敏感词 + flooding)
  streaming.py  句界缓冲-放行(流式输出审核)
  model_guard.py 通用审核模型 adapter(OpenAI 兼容端点)
  pipeline.py   SafetyPipeline(规则 → 模型,同步/异步双模式)
```

| 阶段 | 同步(规则) | 异步(模型) | 作用 |
|---|---|---|---|
| 输入(都生效) | 越狱检测 + 敏感词 + 超长/flooding → **BLOCK** | unsafe → **BLOCK** | 拦在推理前 |
| 输出·非流式 | 敏感词 → **REDACT**(脱敏) | unsafe → **BLOCK** | 不返给用户 |
| 输出·流式 | 句界缓冲,REDACT 后逐句放行 | **不参与**(避免逐句调模型) | 低延迟,违规不透传 |

审核模型通过 `ModelModerationGuard` 接任意 OpenAI 兼容端点(Llama Guard / Qwen 审核 / 自定义),异步不阻塞事件循环。默认关闭,配置 `SAFETY_MODEL_ENABLED=1` 启用。

### 模块四:日志与追踪

```
app/logging_config.py   JSON 字段 schema    每请求一条 JSON
app/tracing.py          OTel(可选)          未启用 no-op,不影响测试
```

| 字段 | 用途 |
|---|---|
| `request_id` | 全链路业务主键(凭此还原一次请求的完整时间线) |
| `trace_id` / `span_id` | OTel 追踪(Loki↔Tempo 关联) |
| `input_tokens` / `output_tokens` | 成本核算 |
| `inference_ms` / `total_ms` | 瓶颈定位 |
| `safety_input_action` / `safety_output_action` | 审核审计 |

**手动流水线 span**:`chat.request`→`safety.input`→`quota.check`→`inference.generate`→`safety.output`→`quota.record`,全挂同一 trace。装 `opentelemetry-instrumentation-httpx` 后出站推理/审核调用自动注入 `traceparent`,vLLM span 可串联。

---

## 目录结构

```
app/
├── main.py              FastAPI 应用工厂 + 路由(薄 HTTP 适配层)
├── config.py            集中配置,环境变量优先
├── logging_config.py    JSON 结构化日志 + request_id + trace_id 注入
├── metrics.py           应用/网关层 Prometheus 指标
├── tracing.py           OTel 流水线 span(可选,未装时 no-op)
├── api/
│   └── service.py       ChatService 全链路编排(框架无关,可脱离 FastAPI 单测)
├── inference/
│   ├── base.py          InferenceBackend 接口 + InferenceError
│   ├── mock.py          Mock 后端(无 GPU 即可跑通全链路)
│   └── openai_compat.py OpenAI 兼容后端(vLLM/TGI/SGLang,非流式 + SSE)
├── quota/
│   ├── service.py       QuotaService(日/月分离 store,预检 + 回写)
│   └── sql_store.py     SqlMonthlyStore(写穿 upsert,PB 级)
└── safety/
    ├── base.py          InputGuard/OutputGuard/AsyncGuard 接口
    ├── rules.py         DFA 规则引擎(敏感词 + 越狱检测)
    ├── streaming.py     流式句界缓冲-放行审核
    ├── model_guard.py   通用审核模型 adapter
    └── pipeline.py      SafetyPipeline(规则→模型,同步/异步)

gateway/kong/kong.yml     Kong 声明式配置(key-auth + rate-limiting + 分级 consumer)
monitoring/
├── prometheus/           三源抓取 + 告警规则
└── alertmanager/         告警路由

sql/monthly_usage.sql     PG 表结构(月度 token 配额持久化)

tests/
├── test_quota.py         配额: 超限拒绝 · Retry-After · 回写
├── test_quota_sql.py     PG 写穿: 累加 · 月份隔离 · durability
├── test_safety.py        内容安全: DFA · 越狱拦截 · 脱敏
├── test_streaming.py     流式: 句界缓冲 · SSE 解析 · 全链路
├── test_model_safety.py  审核模型: 异步 guard · fail-open/closed · BLOCK 路径
├── test_vllm_adapter.py  推理: OpenAI 兼容解析 · 错误映射
├── test_chain.py         全链路: 编排 · 错误→HTTP · request_id
└── test_tracing.py       OTel: span 生成 · trace_id 注入日志 · no-op
```

53 tests,`pytest` 直接跑,不依赖 Redis/PG/Kong/GPU。

---

## 快速开始

### 安装与测试

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest -q                              # 53 tests, < 2s
```

### 本地起 Mock 后端

```bash
uvicorn app.main:app --reload --port 8000
```

```bash
# 非流式
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hello"}]}'

# 流式(SSE)
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hello"}],"stream":true}'
```

### 接真实 vLLM

```bash
INFERENCE_BACKEND=vllm \
INFERENCE_BASE_URL=http://localhost:8001 \
MODEL_NAME=Qwen/Qwen2.5-7B-Instruct \
uvicorn app.main:app --port 8000
```

### 完整基础设施(docker-compose)

```bash
docker-compose up -d

# 服务端口:
#   8080  Kong 代理入口(鉴权 + QPS 限流)
#   9090  Prometheus
#   3000  Grafana (admin/admin)
#   8001  Kong Admin API
```

带 `X-Consumer-ID: tier-pro` 访问 Kong 代理入口以使用更高配置的分级限流。

### 开启审核模型

```bash
SAFETY_MODEL_ENABLED=1 \
SAFETY_MODEL_BASE_URL=http://your-guard-model:8002 \
SAFETY_MODEL_NAME=meta-llama/Llama-Guard-3-8B \
uvicorn app.main:app --port 8000
```

### 开启 OTel 追踪

```bash
TRACING_ENABLED=1 \
OTEL_EXPORTER=otlp \
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces \
uvicorn app.main:app --port 8000
```

---

## 配置参考

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `INFERENCE_BACKEND` | `mock` | `mock` / `vllm` / `tgi` / `sglang` |
| `INFERENCE_BASE_URL` | `http://localhost:8000` | 推理引擎地址 |
| `INFERENCE_API_KEY` | _(空)_ | 访问推理引擎的 API key |
| `INFERENCE_TIMEOUT` | `60` | 推理超时(秒) |
| `MODEL_NAME` | `mock-model-0.1` | 模型名 |
| `QUOTA_STORE` | `memory` | `memory` / `redis` / `redis_pg` |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis 地址 |
| `PG_DSN` | `postgresql://u:p@localhost/db` | PG 连接串(`redis_pg` 时必填) |
| `DEFAULT_DAILY_TOKEN_QUOTA` | `100000` | 默认每日 token 配额 |
| `DEFAULT_MONTHLY_TOKEN_QUOTA` | `2000000` | 默认每月 token 配额 |
| `SAFETY_ENABLED` | `1` | 启用内容安全 |
| `MAX_INPUT_CHARS` | `8000` | 输入最大字符数 |
| `SAFETY_MODEL_ENABLED` | `0` | 启用审核模型 |
| `SAFETY_MODEL_BASE_URL` | `http://localhost:8002` | 审核模型地址 |
| `SAFETY_MODEL_FAIL_OPEN` | `1` | 审核宕机放行(1)还是拦截(0) |
| `LOG_LEVEL` | `INFO` | 日志级别 |
| `TRACING_ENABLED` | `0` | 启用 OTel 追踪 |
| `OTEL_EXPORTER` | `console` | `console` / `otlp` |

---

## 设计原则

- **推理引擎解耦** — 所有推理走 `InferenceBackend` 接口,换引擎只加 adapter
- **审核可插拔** — DFA 规则引擎(同步) + 审核模型(异步),接口化可热替换;流式句界缓冲脱敏后才放行
- **配额 store 抽象** — 测试用内存,生产日 Redis + 月 PG 写穿,业务代码不变
- **测试零依赖** — 核心逻辑纯 Python,不依赖 Redis/PG/Kong/GPU,`pytest` 秒级跑绿
- **可选组件 no-op** — OTel / 审核模型未启用或未安装时完全无副作用

## 🚩 上线前待确认

- [ ] 内容安全合规:面向国内是否必须接有资质第三方审核(见 [tech-stack.md](docs/tech-stack.md#-阻塞项合规先行待与法务确认))
- [ ] 日志隐私策略:保留周期、PII 脱敏字段、访问权限(见 [log-schema.md](docs/log-schema.md#-待确认项实现前与需求方法务确认勿自行假设))
- [ ] 审核模型 fail-open vs fail-closed:默认 fail-open(可用性优先);合规场景可能须 fail-closed
- [ ] Kong vs APISIX 最终确认(当前 Kong 声明式配置就绪,切换需改配置格式)

## License

MIT © 2026 nicholasli — see [LICENSE](LICENSE)
