# Gateway Phase 1 — 设计规格

**日期**: 2026-07-12  
**状态**: draft  
**依赖**: ADR-000, ADR-001, ADR-002, ADR-008  
**代码位置**: `gateway/`（项目根目录，与 `console/` 平级）

### 依赖 ADR 摘要

| ADR | 与本 spec 相关的关键点 |
|-----|----------------------|
| **ADR-000** (Platform Object Model) | APIKey 对象含 `id, key_prefix, quota`（monthly_token_limit）；InferenceRequest 含 `model, messages, stream` |
| **ADR-001** (架构总览) | Gateway 位于 Cloud LB 之后、Control Plane + Data Plane 之上；`/v1/admin/*` → Console API，`/v1/chat/*` → vLLM/Zealot |
| **ADR-002** (Gateway) | 自研 Rust；body-based 路由；5 阶段 tower middleware；SSE tee 计费；ArcSwap 路由表热更新；Phase 1 M3 冷启动排队 |
| **ADR-008** (认证策略) | API Key 验证：Redis 缓存（hot path）→ Auth Service（miss fallback）→ PostgreSQL；Key 吊销用 Pub/Sub + `revocation_version`；**Phase 1 不实现 Pub/Sub，依赖 Redis TTL（60s）过期** |

> **与 ADR-000 的 quota 概念区分**：ADR-000 的 `quota.monthly_token_limit` 是月度总额（Control Plane 管理）。本 spec 的 `quota_limits`（§4.2）是 **per-model per-window 的速率限制**（Gateway 本地执行），与月度总额是两层独立控制。两者由 Console API 在创建 API Key 时统一设定，Gateway 只读取速率限制部分。

---

## 1. 概述

Gateway 是 Ultralisk 推理平台的统一流量入口，自研 Rust 实现。Phase 1 覆盖单实例部署下的核心链路：API Key 认证 → body 解析 → 模型路由 → 滑动窗口限流 → SSE 流式代理 + 计费提取。冷启动排队在 M3 交付。

**不在 Phase 1 M1-M2 范围**：多实例 Redis 攒批、三层健康检查（仅做基础 HTTP 健康探测）、Circuit Breaker、CRD 热更新。

### 部署拓扑（Phase 1）

```
Client → Cloud LB (TLS) → Gateway (:8080) ─┬─ /v1/admin/* → Console API (:3100)
                                            └─ /v1/chat/*  → vLLM (:8000)
```

---

## 2. 技术选型

| 层 | 选型 | 理由 |
|---|------|------|
| HTTP 框架 | **axum** | tower 原生，和 middleware 模型天然匹配；Rust Web 生态事实标准 |
| HTTP 客户端 | **reqwest** | 异步 HTTP 客户端，支持流式响应 |
| 异步运行时 | **tokio** (multi-thread) | axum/reqwest 的默认运行时 |
| JSON | **serde + serde_json** | 标准 |
| Redis 客户端 | **redis-rs** (`redis` crate + tokio feature) | 最成熟 |
| 配置 | 环境变量 | Phase 1 简单场景足够，不引入 figment |
| 日志 | **tracing + tracing-subscriber** | 结构化日志，可升级到 opentelemetry |
| Metrics | **metrics + metrics-exporter-prometheus** | 暴露 `/metrics` 端点 |
| 路由表热更新 | **ArcSwap** | 无锁读写 + 热替换，tokio 兼容 |

---

## 3. 目录结构

```
gateway/
├── Cargo.toml
├── src/
│   ├── main.rs              # 入口：解析配置、启动 server、graceful shutdown
│   ├── config.rs            # 环境变量读取
│   ├── app.rs               # axum Router 组装
│   ├── middleware/
│   │   ├── mod.rs
│   │   ├── auth.rs          # API Key 认证（tower middleware）
│   │   ├── rate_limit.rs    # 滑动窗口限流（tower middleware）
│   │   └── observe.rs       # Prometheus metrics + tracing（最外层 middleware）
│   ├── extract/
│   │   ├── mod.rs
│   │   └── chat_request.rs  # axum FromRequest extractor：解析 body → ChatRequest，缓存 Bytes
│   ├── route/
│   │   ├── mod.rs
│   │   ├── table.rs         # RouteTable (ArcSwap<HashMap<model, Pool>>)
│   │   └── resolver.rs      # model → pool → pod 解析
│   ├── proxy/
│   │   ├── mod.rs
│   │   ├── chat_proxy.rs    # /v1/chat/* SSE 透传 + usage 提取
│   │   ├── admin_proxy.rs   # /v1/admin/* 透传到 Console API
│   │   └── usage_writer.rs  # Raw Usage Event 写入 PG
│   ├── shutdown.rs          # 优雅关闭：drain + 超时
│   └── health.rs            # 健康检查端点
└── tests/
    └── integration/
        └── e2e.rs           # 端到端测试（需 Redis + mock backend）
```

> **`extract/` vs `middleware/`**：`chat_request.rs` 是 axum `FromRequest` extractor，不是 tower middleware。原因是它需要消费 request body（tower middleware 操作的是 opaque `http::Request`，消费 body 需要特殊处理）。extractor 在 handler 层运行，解析后将 `ChatRequest` + 原始 `Bytes` 存入 extensions，下游 middleware 和 handler 读取。

---

## 4. 处理链

### 4.1 请求生命周期（`/v1/chat/completions`）

```
请求到达
  │
  ▼
┌──────────────────────────────────────────────────────────┐
│ ObserveLayer (最外层 — 每个请求的 tracing span + duration) │
└──────────────────────┬───────────────────────────────────┘
                       ▼
┌─────────────┐
│ VerifyKey   │  tower middleware: 从 Header 提取 API Key
│ (auth.rs)   │  Redis 命中 → 注入 AuthResult 到 extensions
│             │  Redis 未命中 → 调 Auth Service → 写回 Redis (TTL: 60s)
│             │  status=revoked → 401; key 不存在 → 401
│             │  Strip 客户端注入的 X-User-Id 等 header, 重新注入可信值
└──────┬──────┘
       │ extensions 中: AuthResult { user_id, org_id, api_key_id, quota_limits }
       ▼
┌──────────────┐
│ ChatRequest  │  axum extractor (FromRequest): 解析 body → ChatRequest
│ (extract/    │  同时缓存原始 Bytes (用于后续转发), 存入 extensions
│  chat_req.rs)│  非法 JSON → 400; model 字段缺失 → 400
└──────┬──────┘
       │ extensions 中: ChatRequest + 原始 body Bytes
       ▼
┌─────────────┐
│ ResolveRoute│  从 extensions 读 model → 查 RouteTable (ArcSwap)
│ (resolver.rs│  无匹配 → 404
│  + table.rs)│  pool 非空 → 选 Pod (round-robin) → 存入 extensions
│             │  pool 为空 → Phase 1 M1-M2: 503 / Phase 1 M3: 冷启动排队
└──────┬──────┘
       │ 只有路由命中才继续
       ▼
┌─────────────┐
│ RateLimit   │  handler 内部调用: 从 extensions 读 model + api_key_id
│ (rate_      │  从 AuthResult 读 quota_limits[model] 或 quota_limits["*"]
│  limit.rs)  │  Redis sorted set 滑动窗口 → 超限: 429 + Retry-After
└──────┬──────┘
       ▼
┌─────────────┐
│ Proxy       │  handler: 从 extensions 取 Pod 地址 + 原始 Bytes
│ (chat_proxy │  转发到 vLLM，SSE 流式透传 + usage 提取 → 写 PG
│  .rs)       │  上报 metrics，记录 tracing events
└──────┬──────┘
       ▼
    响应返回客户端
```

> **ObserveLayer 位置**：作为最外层 middleware，包裹整个链。每个请求自动创建 tracing span（含 request_id），记录总耗时、状态码。Prometheus metrics 也在此层采集，确保 4xx/5xx 提前返回的请求也被统计。

### 4.2 认证层 (`middleware/auth.rs`)

```
输入：Authorization: Bearer ultr_xxx
处理：
  0. **Strip 客户端注入的信任 header**
     移除请求中已有的 X-User-Id, X-Org-Id, X-Api-Key-Id。
     实现：req.headers_mut().remove("x-user-id") 等。

  1. 从 Redis 查 apikey:ultr_xxx → { user_id, org_id, status, quota_limits, revocation_version }
     其中 quota_limits: map[model_id → token_limit_per_window]
     例: { "llama-8b": 100000, "llama-70b": 50000, "*": 50000 }
     "*" 是通配 fallback：若请求的 model 不在 map 中，用 "*" 的限额

  2. 缓存命中:
     - status=revoked → 401
     - status=active + revocation_version 匹配 → 放行
     - Phase 1 不检查 revocation_version (无 Pub/Sub, 见下文)

  3. 缓存未命中 → 调 Auth Service (POST {AUTH_SERVICE_URL}/validate-key)
     **防 thundering herd——oneshot channel 模式:**
       use tokio::sync::oneshot;
       // per-key 的飞行中请求缓存: DashMap<ApiKeyId, oneshot::Sender<AuthResult>>
       // 第一个请求: 创建 oneshot channel → 调 Auth Service → 写 Redis → send 结果
       // 后续请求: 找到已有 channel → 等待 receiver（不重复调 Auth Service）
       
       **失败处理**：winner 调 Auth Service 失败（网络/超时/5xx）时需要清理，
       否则 stale entry 会阻塞后续所有请求：
       - winner 失败时 → 从 DashMap 移除 entry → drop sender
       - 等待者收到 RecvError → 各自重试一次（带随机 jitter, 100-500ms）
       - 重试仍失败 → 返回 503（Auth Service 不可达，Gateway 无法验证 Key）
       - 重试成功 → 写 Redis，下一次请求直接从缓存命中

  4. **缓存失败的 Key 也缓存**（防暴力破解穿透到 Auth Service）
     Key 不存在或 revoked → Redis 写入 { status: "not_found" }, TTL 5s
     后续 5s 内同一 Key 的请求直接 401，不调 Auth Service

  5. status=active → 将 AuthResult 存入 request extensions
     注入 X-User-Id, X-Org-Id, X-Api-Key-Id header → 下游使用

输出：request extensions 中的 AuthResult + 注入的 header
```

**配额粒度**：per-api-key per-model，和 ADR-000 的月度总配额 (`monthly_token_limit`) 是两层独立控制。前者是 Gateway 层的速率限制，后者是 Control Plane/Billing 层的月度硬顶。

**Key 吊销**：Phase 1 简化——不实现 Pub/Sub。Redis 缓存 TTL 设为 60s（可配置），最多 60s 内吊销生效。Phase 2 上 Pub/Sub 版本号方案。

### 4.3 限流层 (`middleware/rate_limit.rs`)

```
前置条件：Auth 已完成、Body 已解析、Route 已命中
输入：从 extensions 读取 api_key_id, model, ChatRequest, AuthResult (含 quota_limits)

配额查找：
  let limit = auth.quota_limits.get(&model)
                  .or_else(|| auth.quota_limits.get("*"))
                  .copied()
                  .unwrap_or(DEFAULT_QUOTA);

算法：Redis sorted set 滑动窗口
  key: ratelimit:{window}:{api_key_id}:{model}
  member: {timestamp_ms}:{estimated_tokens}
  
每次请求：
  1. ZREMRANGEBYSCORE key -inf (now - window)
  2. ZRANGEBYSCORE key (now - window) +inf → 汇总 token 消耗
  3. 汇总 < limit → 放行, ZADD key {now}:{tokens_estimate}
  4. 汇总 >= limit → 429 + Retry-After

Phase 1 tokens_estimate: input characters / 4 + max_tokens（请求里的 max_tokens 参数）
因为此时还没实际推理，用估算值占位。Phase 2 用真实 usage 回写修正。
```

**滑动窗口大小**：可配置 (`RATE_LIMIT_WINDOW_SECS`，默认 60s)。**429 响应**：body `{"error":"Rate limit exceeded","retry_after": 15}`。

### 4.4 路由层 (`route/`)

#### RouteTable 数据结构

```rust
use arc_swap::ArcSwap;

pub struct RouteTable {
    pub routes: HashMap<String, Pool>,  // model_id → Pool
    pub version: u64,
}

pub struct Pool {
    pub name: String,
    pub pods: Vec<Pod>,
    pub strategy: PoolStrategy,  // Phase 1: 仅 informational, 不驱动行为
}

pub struct Pod {
    pub id: String,
    pub address: String,          // "host:port" — 支持 IPv4/IPv6/域名
    pub weight: u32,              // Phase 2 使用, Phase 1 永远为 1
}

pub enum PoolStrategy {
    Serverless,   // Phase 1: 唯一实际使用的策略
    Batch,        // Phase 1 M2
    Reserved,     // Phase 2
    Dedicated,    // Phase 3
}
```

> **`Pod.address` 为 `String` 而非 `SocketAddr`**：vLLM Pod 地址可能是 K8s service name（`vllm-8b.svc.cluster.local:8000`），需要 DNS 解析。`reqwest` 接受 URL string 即可，不需要提前解析为 `SocketAddr`。

> **`strategy` 和 `weight` 字段**：Phase 1 只存储不读取。`PoolStrategy` 的 `Batch` 变体在 M2 启用前不驱动任何逻辑。`weight` 始终为 1。

#### 路由解析流程

```
输入：从 request extensions 读取 ChatRequest.model（已由 extractor 解析）
1. Lookup: ROUTE_TABLE.load().routes.get(&model)
2. 无匹配 → 404
3. Pool.pods.is_empty():
   - Phase 1 M1-M2 → 503 (model_not_available)
   - Phase 1 M3 → 冷启动排队（触发 KAI Scheduler→起 Pod→模型就绪→取出请求）
4. 选 Pod: round-robin (Phase 2: least-connections)
5. 构造上游 URL: http://{pod.address}/v1/chat/completions
6. 将选中的 Pod 信息存入 request extensions → 下游 Proxy 层读取
```

#### 路由表初始化

**同步加载，阻塞 server 启动**。`main.rs` 在 `Server::bind().serve()` 之前：
1. 从 `ROUTE_TABLE_PATH` 配置文件加载初始路由表
2. 插入到全局 `ROUTE_TABLE` (`ArcSwap::store`)
3. 加载失败 → panic（Gateway 无路由表不应启动）

这样不会出现"server 已启动但路由表为空"的竞态窗口。

格式：

```json
{
  "version": 1,
  "routes": {
    "llama-3.1-8b-instruct": {
      "name": "serverless-llama8b",
      "strategy": "serverless",
      "pods": [
        {"id": "vllm-8b-01", "address": "10.0.1.10:8000", "weight": 1},
        {"id": "vllm-8b-02", "address": "10.0.1.11:8000", "weight": 1}
      ]
    }
  }
}
```

Phase 1 静态配置加载，Phase 2 加上 Redis pubsub 热更新。

### 4.5 代理层 — Chat Completions (`proxy/chat_proxy.rs`)

#### 转发流程

```
输入：Pod.address + 原始 body Bytes (从 extensions 读取)
处理：
  1. 清理内部 header：在发给 vLLM 前，移除 X-User-Id, X-Org-Id, X-Api-Key-Id
     （这些是 Gateway 自己注入给下游的，vLLM 不需要）
  2. 设置 Host header 为 Pod.address 的 host 部分
  3. reqwest POST 到 http://{pod.address}/v1/chat/completions
  4. stream: false → 等待完整响应 → 提取 usage → 返回客户端 → 写计费
  5. stream: true  → 建立 SSE stream (见下文)
```

> **Client `Host` header 不向下透传**。将 Host 设为 Pod 地址可以避免 vLLM 日志混乱，且防止客户端 Host 影响 vLLM 行为。

#### SSE 流处理

```
1. 从 reqwest response 获取 byte stream
2. 累积缓冲区: Vec<u8>
   - 每次 read 追加到缓冲区
   - 查找 "\n\n" (SSE 事件分隔符)
   - 提取完整事件 → 写入客户端 (立即 flush)
   - 非完整事件留在缓冲区
   
3. 最后一个事件 (含 "usage" 字段):
   - 提取 { prompt_tokens, completion_tokens } → spawn 异步任务写入 PG
   - 写入客户端 (含最终 usage chunk + data: [DONE])
   
4. 如果流结束但未收到 usage:
   - 可能是 vLLM 异常退出
   - 记录 error log + gateway_missing_usage_total{model}
   - 客户端已收到全部生成内容，按正常响应返回
   
5. 超时: 请求级 timeout (UPSTREAM_TIMEOUT_SECS, 默认 60s)
   - Phase 1: 整个请求的超时，非 idle timeout
   - 超时 → 504 + 关闭连接
```

**为什么需要累积缓冲区**：SSE 的 `data:` 行可能跨 TCP 帧。一行 `{"usage":{"prompt_tokens":100` 和下一帧的 `,"completion_tokens":500}}` 需要拼起来才是合法 JSON。简单按行 split 会解析失败。

#### 取消处理

```
客户端断开连接 (reqwest request handle dropped)
  → 上游请求被 cancel
  → 如果已收到 final usage → 已计费
  → 如果未收到 (生成中途取消) → 
      Phase 1: 丢失本次 usage 计数 (已知限制)
      → 记录 metrics: gateway_cancelled_without_usage_total{model}
      Phase 2: 发 cancel 信号给 Backend, 等 final usage 后再计费
```

#### 错误处理

| 场景 | 处理 |
|------|------|
| 上游连接失败 | 502 Bad Gateway |
| 上游超时 (读取) | 504 Gateway Timeout |
| 上游返回非 200 | 透传状态码 + body |
| SSE 解析错误 | 记录 error log，继续透传（不过度介入） |

### 4.6 管理请求代理 (`proxy/admin_proxy.rs`)

`/v1/admin/*` 的处理链不同于 `/v1/chat/*`——不需要 ParseBody、Route、RateLimit。它只需要基本认证 + 透传。

```
处理链:
  ObserveLayer → VerifyKey (仅 auth) → Admin Proxy

Admin Proxy 逻辑：
  1. 从 AUTH_SERVICE_URL 同样的 Auth Service 验证 API Key / JWT
     （Phase 1: 和 chat 路径共享同一个 Auth middleware, 只是后续跳过 Route + RateLimit）
  2. 构造上游 URL: CONSOLE_API_URL + original_path + query_string
     例: GET /v1/admin/models → http://localhost:3100/v1/admin/models
  3. 转发原始 method + headers + body 到 Console API
     - 清理 X-User-Id, X-Org-Id, X-Api-Key-Id (Console API 从自己注入的 header 读)
     - 注入 Gateway 已验证的 X-User-Id 等 header（Console API 可信任）
  4. 响应透传：状态码、headers、body 原样返回客户端
  5. 支持所有 HTTP methods (GET, POST, PUT, DELETE, PATCH)
  6. 超时: ADMIN_UPSTREAM_TIMEOUT_SECS (默认 30s, 管理接口不应慢)
  7. 非 2xx 响应: 透传, 不重试
```

**为什么不走 ParseBody/Route/RateLimit？** 管理请求的 body 不一定是 `ChatRequest`（可能是 JSON payload、form data、空 body）。`model` 字段不存在。对 `/v1/admin/*` 做 body 解析和 model 路由没有意义。

### 4.7 计费写入 (`proxy/usage_writer.rs`)

```
Raw Usage Event 格式：
{
  "request_id": "req_xxx",          // 主键（upsert）
  "api_key_id": "ultr_abc",
  "user_id": "usr_xxx",
  "org_id": "org_xxx",
  "model_id": "llama-8b",
  "prompt_tokens": 100,
  "completion_tokens": 500,
  "started_at": "2026-07-12T10:00:00Z",
  "completed_at": "2026-07-12T10:00:03Z",
  "status": "completed" | "cancelled" | "error"
}
```

写入方式：直接写 PostgreSQL `raw_usage_events` 表，`request_id` upsert（`ON CONFLICT (request_id) DO UPDATE`）。

**错误处理**：写入失败 → 记录 error log + metrics counter `gateway_usage_write_errors_total`，**不阻塞响应**。

**写入失败的对账**（人工兜底路径）：
1. 告警触发 → 运维从 Grafana 确认 `gateway_usage_write_errors_total` 影响范围
2. 从 Gateway 的 tracing span 日志（含 request_id + usage）重放写入
3. 如果日志也丢失 → 从 vLLM inference log 反查
4. Phase 2 目标：本地 WAL + 重试队列，消除人工介入

### 4.8 观测层 (`middleware/observe.rs`)

**最外层 middleware**，包裹整个请求链（含 `/v1/admin/*` 和 `/v1/chat/*`）。

```
Prometheus metrics:
  gateway_requests_total{method, path, status, model}
  gateway_request_duration_seconds{method, path, model}        ← histogram
  gateway_upstream_requests_total{model, pool, status}
  gateway_upstream_duration_seconds{model, pool}               ← histogram
  gateway_tokens_total{model, direction}                        ← input/output
  gateway_cancelled_without_usage_total{model}                  ← 中途取消未收到 usage
  gateway_missing_usage_total{model}                            ← 流正常结束但无 usage
  gateway_usage_write_errors_total                              ← 计费写入失败
  gateway_auth_failures_total{reason}                           ← invalid_key / revoked

暴露: GET /metrics → text/plain (Prometheus 格式)

结构化日志:
  每个请求 → tracing span (request_id, user_id, model, api_key_id)
  关键事件: auth_cache_hit|miss, auth_service_call, route_resolution, rate_limit_check,
            proxy_start, sse_chunk_flush, usage_extracted, usage_write, proxy_end
```

---

## 5. 端点

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/v1/chat/completions` | 推理请求（转 vLLM） |
| `*` | `/v1/admin/*` | 管理请求（转 Console API），支持所有 HTTP methods |
| GET | `/health` | 存活检查（返回 200，不做任何 IO） |
| GET | `/ready` | 就绪检查：Redis PING + 路由表非空。**不检查后端 Pod 存活**——Pod 挂了只有实际转发时才发现（502/503）。Phase 2 升级为包含 Active Health Check 结果 |
| GET | `/metrics` | Prometheus metrics |

---

## 6. 配置

环境变量：

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `GATEWAY_PORT` | `8080` | 监听端口 |
| `REDIS_URL` | `redis://localhost:6379` | Redis 连接 |
| `AUTH_SERVICE_URL` | `http://localhost:3101` | Auth Service 地址（Key 验证） |
| `CONSOLE_API_URL` | `http://localhost:3100` | Console API 地址（管理请求透传） |
| `RATE_LIMIT_WINDOW_SECS` | `60` | 滑动窗口大小（与 AUTH_CACHE_TTL 独立，勿混淆） |
| `RATE_LIMIT_ENABLED` | `true` | 是否启用限流 |
| `AUTH_CACHE_TTL_SECS` | `60` | API Key Redis 缓存 TTL（与 RATE_LIMIT_WINDOW 独立） |
| `UPSTREAM_TIMEOUT_SECS` | `60` | Chat 上游超时 |
| `ADMIN_UPSTREAM_TIMEOUT_SECS` | `30` | Admin 上游超时 |
| `ROUTE_TABLE_PATH` | `config/route_table.json` | 路由表配置文件 |
| `DATABASE_URL` | - | **必需**。PG 连接（计费写入）。缺失时 Gateway 启动失败 |
| `MAX_BODY_SIZE` | `10485760` (10MB) | 请求 body 最大字节数，超出返回 413 |
| `LOG_LEVEL` | `info` | tracing 日志级别 |
| `SHUTDOWN_DRAIN_SECS` | `30` | 优雅关闭时等待现有连接完成的最大秒数 |

---

## 7. 错误响应格式

统一 JSON：

```json
{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Token quota exceeded for model llama-8b. Retry after 15 seconds.",
    "retry_after": 15
  }
}
```

| HTTP 状态 | code | 场景 |
|-----------|------|------|
| 400 | `invalid_request` | Body 解析失败、model 字段缺失 |
| 401 | `invalid_api_key` | Key 不存在或格式错误 |
| 401 | `revoked_api_key` | Key 已被吊销 |
| 413 | `body_too_large` | 请求 body 超过 MAX_BODY_SIZE |
| 429 | `rate_limit_exceeded` | 超出 token 配额 |
| 404 | `model_not_found` | 路由表无此 model |
| 502 | `upstream_error` | 后端连接失败 |
| 503 | `model_not_available` | 路由表有此 model 但无可用 Pod |
| 504 | `upstream_timeout` | 上游响应超时 |

---

## 8. 优雅关闭

Gateway 作为 SSE 长连接持有者，不能收到 SIGTERM 后立即退出。关闭流程：

```
1. 收到 SIGTERM
2. 停止接受新连接 (axum::serve 的 graceful shutdown)
3. 等待现有连接完成 (最长 SHUTDOWN_DRAIN_SECS, 默认 30s)
   - 期间正在进行的 SSE 流继续透传
   - 计费写入继续完成
4. 超过 drain 超时 → 强制关闭所有连接
5. 清理: 关闭 Redis 连接池、PG 连接池
6. 退出进程
```

---

## 9. 测试策略

### 单元测试
- `middleware/auth.rs`: API Key 解析、Redis 缓存命中/未命中/revoked/not_found、Auth Service fallback
- `extract/chat_request.rs`: 合法 JSON → ChatRequest、非法 JSON → 400、model 字段缺失 → 400、stream 默认值
- `middleware/rate_limit.rs`: 滑动窗口算法（mock Redis）、配额 fallback（model 不在 map → "*"）
- `route/table.rs`: RouteTable 查找、空路由表处理
- `route/resolver.rs`: route 匹配 + 404/503 分支
- `proxy/usage_writer.rs`: upsert SQL、字段映射

### 集成测试
- 完整链路：fake HTTP backend (返回固定 SSE) + Redis + Gateway → 验证 200 + usage 提取
- 限流：模拟连续请求超过配额 → 429
- 认证失败：无效 Key → 401
- 路由 404：不存在的 model → 404
- **Header 注入防护**：客户端请求带 X-User-Id → Gateway 响应里透传给 mock backend 的 header 是 Gateway 注入的值，不是客户端伪造的值
- Admin 代理：GET/POST/DELETE 请求透传到 mock Console API

### 工具
- `cargo test` 跑所有测试
- 集成测试用 `testcontainers` 启动 Redis 容器
- Mock backend 用 `wiremock`；mock Auth Service 同理

---

## 10. Phase 1 明确不做的（防范围蠕变）

| 项目 | 何时做 | 为什么不做 |
|------|--------|-----------|
| 三层健康检查 | Phase 2 M4 | M1-M2 只做 `/health` + `/ready`，够用 |
| Circuit Breaker | Phase 2 M5 | 单实例熔断意义不大 |
| Pub/Sub Key 吊销 | Phase 2 | 依赖 60s TTL 过期即可 |
| Redis 攒批队列 | Phase 2 M4 | 单实例用进程内存攒批（如果做 Batch） |
| Batch 策略攒批 | Phase 1 M2 | M1 不做 Batch 业务 |
| CRD 路由表更新 | Phase 2 M6 | Phase 1 用配置文件 + 重启加载 |
| gRPC Backend Runtime | Phase 2 | Phase 1 直接 HTTP 代理 vLLM |
| 多实例部署 | Phase 2 M4 | Phase 1 单实例即可 |
| TLS termination | 永不 | 上游云 LB 负责 |

---

## 11. 里程碑

### M1 (第 1-2 周) — 最小可行链路
- [ ] `gateway/` 项目骨架 + `Cargo.toml` + axum hello world
- [ ] 配置加载 + 路由表同步初始化
- [ ] 认证层：API Key 解析 + Redis 缓存 + Auth Service fallback
- [ ] ChatRequest extractor：body 解析 + 缓存
- [ ] 路由层：静态配置加载 + body-based 路由
- [ ] 代理层（chat + admin）：HTTP 非流式转发
- [ ] 端到端：`curl → Gateway → mock vLLM → 响应` 跑通

### M2 (第 2-3 周) — 流式 + 限流 + 计费
- [ ] SSE 流式透传 + 累积缓冲区解析 + usage 提取
- [ ] 滑动窗口限流（Redis sorted set）
- [ ] 计费写入 PostgreSQL (usage_writer)
- [ ] Prometheus metrics + `/metrics` 端点
- [ ] Admin 代理全 methods 支持
- [ ] 优雅关闭 + body size limit

### M3 (第 3-4 周) — 稳定化 + 冷启动排队
- [ ] 冷启动排队（触发 KAI Scheduler → 等模型就绪 → 取出请求）
- [ ] 模型预热 API（如有需要）
- [ ] 集成测试全覆盖（testcontainers）
- [ ] 错误处理全覆盖
- [ ] 结构化日志 + trace ID 传播
- [ ] 文档：README + 部署说明

---

## 12. 开放问题

### 本周内需确定（阻塞 M1）

**1. vLLM 后端不可用时的测试方案**

M1 的验收标准是「curl → Gateway → vLLM → 响应跑通」，但 GPU 集群大概率不会在 M1 第一周就绪。如果转发目标不可达，Gateway 的 Proxy 层无法端到端验证。决策：

- **方案 A（推荐）**：M1 期间在本地起一个 mock vLLM（axum 或 wiremock），返回固定的 SSE 流和 usage 数据。Gateway 转发到 mock。真正的 vLLM 就绪后再切。
- **方案 B**：M1 期间 Gateway 对接公有的 vLLM endpoint（如 Together API），用公网服务做集成验证。
- **方案 C**：M1 只做到 Gateway 内部单元测试通过，Proxy 层的集成测试推迟到 vLLM 就绪。

**决策截止**：本周三。影响：M1 里程碑描述和测试策略需据此调整。

### 不影响核心架构（待定）

- **API Key 格式**：`ultr_` 前缀 + 32 字符随机串？还是 JWT？（ADR-008 待定）
- **request_id 生成**：Gateway 侧 UUID v7 还是接受客户端透传的 `x-request-id`？
