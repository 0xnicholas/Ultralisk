# ADR-002: Request Router — 自研 Gateway

**日期**: 2026-07-11  
**状态**: accepted  
**依赖**: ADR-000（Platform Object Model）、ADR-001（架构总览）、ADR-009（Zealot 语言栈）

> **对象定位**: Gateway 是 InferenceRequest 的入口状态机。它不创建业务对象，只执行 AuthPolicy → RatePolicy → RoutePolicy 并将请求转发到 Data Plane。

---

## Context

推理平台的请求入口需要一个网关，负责 API Key 认证、按模型路由、流式 SSE 透传、token 级别限流、GPU 感知的健康检查。AI 推理路由和传统 REST API 路由有本质差异：

| 需求 | REST API 网关 | AI 推理需要 |
|------|-------------|-----------|
| 路由依据 | URL path + header | **请求 body 里的 `model` 字段** |
| 流式响应 | 简单透传或不流式 | SSE 透传 + **同时提取 usage stats 用于计费** |
| 限流 | 请求数/秒 | **token 数/分钟**、费用/月 |
| 后端健康 | HTTP 200 = 健康 | GPU 显存满、队列深 → 200 也不健康 |
| 冷启动 | 不存在 | 模型不在 GPU 上 → **排队等待**，不能 503 |

候选方案：**自研 Rust 网关** vs **Kong + 自定义插件** vs **Envoy**。

---

## Decision

选择自研 **Gateway**，Rust 实现，和 Zealot 推理引擎同一技术栈。

```
                             ┌─────────────────────────┐
                             │    Cloud LB (AWS ALB)   │  ← TLS termination
                             │    DDoS / WAF           │      由云平台处理
                             └────────────┬────────────┘
                                          │ HTTP (internal)
                             ┌────────────▼────────────┐
                             │    Gateway        │  ← Rust, 单二进制
                             │                          │
    authenticate ────────────┤    API Key → Redis       │
    ratelimit ───────────────┤    token-based 滑动窗口   │
    route ───────────────────┤    model → pool 路由     │
    proxy ───────────────────┤    SSE 透传 + 计费侧录    │
    observe ─────────────────┤    Prometheus metrics    │
                             └────────────┬────────────┘
                                          │
                        ┌─────────────────┼─────────────────┐
                        ▼                 ▼                  ▼
                  vLLM / Zealot      vLLM / Zealot      Embedding
                  Pool A (Llama70B)  Pool B (Llama8B)   Service
```

Gateway 本身不处理 TLS termination——交给上游云 LB（AWS ALB / GCP LB）。Gateway 专注于推理路由逻辑。

---

## Rationale

### 为什么不用 Kong

Kong 的架构假设是"请求 = URL + header 决定路由"。AI 推理的路由靠请求 body 里的 `model` 字段。Kong 读 body 需要缓冲——一缓冲就和 SSE 流式透传冲突。这是根本性的模型不匹配，不是在 Kong 上写几个插件能解决的。

具体来说，我们在 Kong 上需要写 5 个自定义插件，每一个都和工作模型冲突：

| 插件 | Kong 的限制 |
|------|-----------|
| Body-based model router | `access` 阶段读 body 会缓冲，破坏 SSE 流式 |
| SSE 响应计费 | Kong 的 body_filter 对 SSE 的 `data: [DONE]` 解析不可靠 |
| Token 限流 | Kong 只有 request-count，不感知 token |
| GPU 健康检查 | Kong health checker 不理解 GPU 指标 |
| 冷启动排队 | Kong 无请求队列概念，后端 503 不重试 |

### 为什么自研 Rust 网关

1. **Body-based 路由是原生能力**：解析 JSON、提取 `model` 字段、查路由表——这是 Rust 的 serde + HashMap，没有任何架构阻碍

2. **SSE "tee"**：主路径透传流式响应给客户端，同时 fork 一份到计费分析器。Rust 的 `futures::stream` 天然支持这个模式

3. **Token 限流**：定制滑动窗口算法，Redis sorted set 存储每次请求的 token 消耗

4. **GPU 感知健康检查**：直接查询 vLLM/Zealot 的 `/metrics` 端点（DCGM 指标 + 队列深度）

5. **技术栈统一**：Zealot 推理引擎是 Rust，Gateway 也是 Rust。团队不增加新语言负担

6. **代码量可控**：约 3-5 KLOC，2-3 周完成 Phase 1 MVP

---

## Design：借鉴 Kong 的五个设计模式

弃用 Kong 不代表 Kong 的设计没价值。它在基础设施层有十年生产打磨，五个设计直接复用：

### 1. Phase 执行链

Kong 把请求处理分成明确的 phase。Gateway 用 Rust `tower` 的 middleware 模型做同样的分层：

```
authenticate → ratelimit → route → proxy → observe
     │            │          │       │         │
 验 API Key    滑动窗口   查 model  SSE tee  Prometheus
 (Redis 缓存)  token配额  → pool    +计费    metrics
```

> **Batch 攒批队列**：Batch 策略的 60s 攒批发生在 `route` 阶段。Gateway 多实例部署时，攒批队列必须是 **Redis 共享状态**（列表或流），不是 Gateway 进程内内存。否则每个实例各自攒一份小批，60s 窗口被打散，达不到"攒大批提升 GPU 利用率"的设计目标。Phase 1 单实例时可在进程内实现，多实例部署前必须迁至 Redis。

`tower::ServiceBuilder` 的 layer 组合天然是这种 model。

### 2. 优雅重载（不丢连接）

路由表更新时不能丢弃正在进行的 SSE 流式连接。Kong 的做法——旧 worker 等连接结束再退出——在 Rust 用 `ArcSwap` 实现：

```
新路由表到达
  → 解析并验证
  → ArcSwap::store(新表)       ← 无锁原子替换
  → 新建连接用新表
  → 已有连接持有 Arc<旧表>，继续用
  → 旧表引用计数归零后释放
```

不需要重启进程，不需要 draining worker。

### 3. 限流的滑动窗口算法

Kong 的 rate-limiting 插件用 Redis sorted set 做滑动窗口。Gateway 复用这个模式，但统计维度从"请求计数"改为"token 消耗"：

```
算法：
  key: ratelimit:{api_key}:{model}:{window}
  member: 每次请求的 {timestamp}:{tokens_consumed}
  
  每次请求时：
    1. ZREMRANGEBYSCORE 清理窗口外的记录
    2. ZRANGEBYSCORE 获取窗口内所有记录
    3. 汇总 token_consumed
    4. 如果 < quota → ZADD 新记录，放行
    5. 如果 ≥ quota → 拒绝，返回 429
```

### 4. 健康检查的三层抽象

Kong 的 active/passive/circuit 三层健康模型，Gateway 直接复用并增加 GPU 维度：

```
Layer 1: Active Check
  GET /metrics on each pod every 5s
  → GPU utilization, queue depth, memory pressure
  → mark healthy/unhealthy based on thresholds

Layer 2: Passive Check  
  观察实际推理请求的 error rate, P99 latency
  → 累积到阈值 → 降权（但不是直接下线）

Layer 3: Circuit Breaker
  GPU OOM 连续 3 次
  → 熔断 30s → 半开 1 个试探请求 → 成功则恢复
```

### 5. Prometheus Metrics 分类

Kong 的 metrics 按 service/route/status_code 分类。Gateway 按推理维度分类：

```
zealot_gateway_requests_total{model, pool, api_key_id}
zealot_gateway_latency_seconds{model, phase}        ← histogram: authenticate/route/proxy
zealot_gateway_tokens_total{model, direction}       ← input/output
zealot_gateway_upstream_health{pool, status}
zealot_gateway_cold_start_duration_seconds{model}   ← 排队等待时间
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Gateway (Rust)                                   │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │Authenticate│ │Ratelimit │  │  Route   │  │  Proxy  │ │
│  │           │  │          │  │          │  │         │ │
│  │ API Key → │  │ Redis    │  │ model →  │  │ SSE tee │ │
│  │ Redis     │  │ sorted   │  │ pool     │  │ + billing│ │
│  │           │  │ set      │  │          │  │         │ │
│  └─────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘ │
│        │              │             │              │      │
│  ┌─────▼──────────────▼─────────────▼──────────────▼────┐ │
│  │                   Tower Service Stack                │ │
│  │  ServiceBuilder::new()                               │ │
│  │    .layer(AuthLayer)                                 │ │
│  │    .layer(RateLimitLayer)                            │ │
│  │    .layer(RouteLayer)                                │ │
│  │    .layer(ProxyLayer)                                │ │
│  │    .layer(ObserveLayer)                              │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Route Table (ArcSwap<RouteTable>)                   │ │
│  │  model_id → Pool { pods: Vec<Pod>, strategy }        │ │
│  │  hot-reload via Redis pubsub or K8s CRD watcher      │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  Health Checker                                      │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │ │
│  │  │ Active   │  │ Passive  │  │ Circuit  │          │ │
│  │  │ Checker  │  │ Checker  │  │ Breaker  │          │ │
│  │  │ /metrics │  │ error    │  │ OOM →    │          │ │
│  │  │ poller   │  │ observer │  │熔断 30s   │          │ │
│  │  └──────────┘  └──────────┘  └──────────┘          │ │
│  └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

### 流式取消与计费语义

AI 推理计费比传统 API 计费复杂：用户在生成中途取消请求时，已消耗的 token 必须正确计入。如果 Gateway 的 SSE tee 和 Backend 的 usage 上报因为提前中断而对不上，会出现少计费或多计费。

**取消场景的计费规则**：

```
正常完成:
  Gateway 收到 final InferResponse (usage: {prompt:100, completion:500})
  → 计费: 100 prompt + 500 completion tokens

用户取消(中途):
  Gateway 收到客户端断开 → 发 InferRequest(cancel) 给 Backend
  Backend 停止生成, 返回 final InferResponse (usage: {prompt:100, completion:230})
  → 计费: 100 prompt + 230 completion tokens  ← 已生成的 token 照常计费

网络中断(Backend 侧):
  Gateway 和 Backend 之间的 gRPC stream 意外断开
  → Gateway 使用 "last known usage" (最后一次收到的 delta 累计值)
  → 计费: last_known_tokens ← 保守计费, 可能略少于实际生成
  → 不计费: 0 ← 绝不能用这个, 会导致少收

网络中断(客户端侧):
  客户端断开, Gateway 侧检测到
  → 同"用户取消"流程: 发 cancel 给 Backend, 等 final response
  → 如果 Backend 不响应 cancel (已 crash): 使用 last_known_usage
```

**一致性的保证**：

```
计费 source of truth (ADR-006):

  Backend (Zealot/vLLM) 
      │ final usage report (唯一权威的 token 计数)
      ▼
  Gateway proxy layer
      │ 写入 Raw Usage Event → PostgreSQL (强一致)
      │
      ▼
  计费系统读 PostgreSQL Aggregated Usage
```

Backend 是唯一知道实际生成了多少 token 的一方。Gateway 不做 token 估算——它等 Backend 的 final response 里的 usage 字段。取消场景下 Gateway 会等待 Backend 的 final response（带超时 5s，超时则用 last_known_usage 降级），不会因为 cancel 丢失已生成 token 的计费。

**重复计费防护**：5s 超时使用 last_known_usage 写入后，Backend 的 final response 可能延迟到达（如 5.5s）。计费表以 `request_id` 为唯一键做 **upsert**（非 append），后到的 final usage 覆盖之前的 last_known_usage 估算值，不新增行。这比 INSERT 多一行安全，也比"丢弃延迟响应"多一次修正机会。

**Phase 1 简化**：vLLM Backend 的 OpenAI HTTP 协议在 cancel 时也会返回 usage（OpenAI 标准行为）。Gateway 把 HTTP 响应里的 `usage` 字段原样写入 PostgreSQL，不需要额外处理。

**正面：**
- 架构干净：一个 Rust 二进制做推理路由，不引入 Kong + Postgres + Lua 插件
- 与 Zealot 推理引擎技术栈统一（Rust），团队不增加语言负担
- Body-based 路由、SSE tee 计费、token 限流——原生支持，不走旁路
- 冷启动排队是内置能力，不是"后端 503 就放弃"

**负面：**
- 放弃 Kong 成熟的 DDoS 防护和连接管理（由上游云 LB 补偿）
- 路由热更新（CRD watcher / Redis pubsub）需要自己实现
- 生产环境需要额外关注连接池调优和慢客户端防护

**待跟进：**
- 网关代码仓库位置（`console/gateway/` 还是独立 repo）
- Phase 1 限流方案：先用内存计数器，Phase 2 迁到 Redis
- TLS termination 的策略：云 LB 卸载 TLS，Gateway 内部走 HTTP（降低网关复杂度）
