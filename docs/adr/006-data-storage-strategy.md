# ADR-006: 数据存储策略

**日期**: 2026-07-11  
**状态**: accepted  
**依赖**: ADR-000（Platform Object Model）、ADR-001（架构总览）

> **对象定位**: 存储按 ADR-000 的四领域组织——Control Store (Organization/Project/APIKey)、Cache (InferenceRequest 热路径)、Telemetry (InferenceSession/GPUMetrics)、Artifact Store (ModelRevision 权重)。数据库是实现细节，不是架构决策。

---

## Context

推理平台的数据类型多样——关系型业务数据、毫秒级缓存、高基数 GPU 指标、海量日志、大文件模型权重——无法用单一数据库覆盖。需要按**数据领域**而非技术组件来组织存储。

---

## Decision

数据按四个领域划分，每层有独立存储：

```
┌─────────────────────────────────────────────────────────┐
│                    数据领域划分                          │
│                                                         │
│  CONTROL PLANE         DATA PLANE         ARTIFACT     │
│  (PostgreSQL)          (Redis)           (S3 / MinIO)  │
│  ┌──────────────┐     ┌──────────────┐   ┌──────────┐  │
│  │ 用户/组织     │     │ Session 缓存  │   │ 模型权重  │  │
│  │ API Key      │     │ Rate Limit   │   │ Tokenizer │  │
│  │ 模型元数据   │     │ Worker 状态   │   │ LoRA      │  │
│  │ Endpoint     │     │ Scheduler状态 │   │ 配置模板  │  │
│  │ Deployment   │     │ 路由表缓存    │   │ 导出文件  │  │
│  │ 计费配置     │     └──────────────┘   └──────────┘  │
│  │ 用量聚合     │                                       │
│  └──────────────┘                                       │
│                                                         │
│               OBSERVABILITY                             │
│     ┌──────────────────┐  ┌──────────────────┐         │
│     │   ClickHouse     │  │    Loki + S3     │         │
│     │   GPU Metrics    │  │    App Logs      │         │
│     │   Request Events │  │    Inference Logs │         │
│     │   Audit Events   │  │    Audit Logs    │         │
│     └──────────────────┘  └──────────────────┘         │
└─────────────────────────────────────────────────────────┘
```

| 领域 | 存储 | Phase | 内容 |
|------|------|-------|------|
| **Control Plane** | PostgreSQL | 1 | 关系型业务数据：用户、组织、API Key、模型元数据、Endpoint、Deployment、计费配置、用量聚合 |
| **Data Plane** | Redis | 1 | 毫秒级热数据：Session 缓存、Rate Limit 计数器、Worker 状态、Scheduler 状态、路由表缓存 |
| **Observability** | ClickHouse | 1（提前定义 schema） | GPU 指标、请求事件（token/延迟/费用）、审计事件 |
| **Observability** | Loki + S3 | 1 | 应用日志、推理日志、审计日志（分类存储） |
| **Artifact** | S3 / MinIO | 1 | 模型权重、Tokenizer、LoRA、配置模板、导出文件 |

---

## Rationale

### Control Plane — PostgreSQL

关系型数据——强一致性、事务、JOIN。PostgreSQL 是最适合的：
- 用户/组织/API Key/模型/Endpoint/Deployment：CRUD 为主，变更频率低
- JSONB 支持（Playground session 可以存 PostgreSQL，不一定用 Redis）
- 窗口函数和聚合查询（计费月报）

**用量数据拆分两层**：

```
每次推理请求完成
        │
        ▼
  Gateway 写入 Raw Usage Event  ──────→  PostgreSQL (强一致, 计费 source of truth)
        │                                        │
        │                                        ▼ 每小时 cron（T-2 窗口，非 T-1）
        │                                  Aggregated Usage（按 hour × org × model）
        │                                        │
        │                                        ▼
        │                                  Billing 查询全读 Aggregate，不扫 Raw
        │
        └────→ 异步 pipeline (Phase 2: Event Bus)
                    │
                    ▼
              ClickHouse request_events（分析副本, 允许秒级延迟）
```

**计费 source of truth**：PostgreSQL。计费查询必须读到一致、不丢的数据。
**ClickHouse request_events**：异步复制过去的分析副本。允许秒级延迟，不参与计费计算。

**为什么不双写**：
- 双写意味着 Gateway 同时写 PostgreSQL 和 ClickHouse，网络失败时可能一边有一边没有
- 计费不能容忍"PostgreSQL 有这条但 ClickHouse 没有"的不一致
- 单写 PostgreSQL → pipeline 异步复制到 ClickHouse，失败时可重放，不丢数据

**Phase 1 简化**：在引入 Event Bus 之前，Gateway 只写 PostgreSQL。ClickHouse request_events 表推迟到 Phase 2——Phase 1 分析查询直接查 PostgreSQL Raw Usage Event（数据量小时可行）。

> **写入语义**：Raw Usage Event 以 `request_id` 为主键，upsert（非 append）。流式取消场景下 Gateway 可能先用 last_known_usage 写入估算值，Backend 的 final response 延迟到达后覆盖为精确值。详见 ADR-002。

Raw 短期保留（30 天），Aggregate 长期保留。避免计费查询扫全表。

> **聚合水位线（Watermark）**：聚合任务不处理"刚结束的那一小时"（T-1），而是永远处理 T-2。原因：流式取消场景下，Gateway 可能在整点前用 last_known_usage 写入估算值，Backend 的 final response 在整点后才到达并覆盖——如果 T-1 聚合在整点触发，会拿到未被修正的估算值。延迟一小时聚合给修正留出缓冲窗口。成本：cron 表达式 offset 1h，零额外开销。

### Data Plane — Redis

Redis 的职责远超"Session 缓存"。它是整个系统的**毫秒级热数据层**：

| 用途 | 数据 | 读/写频率 | 为什么必须 Redis |
|------|------|----------|-----------------|
| API Key 验证缓存 | `key:{hash} → user_id, org_id, quota` | 每次请求都读 | Gateway 每请求都验证，缓存到 PG 延迟 5-10ms，Redis < 1ms |
| Token 限流计数器 | sorted set (滑动窗口) | 每次请求都写 | 毫秒级写，支持滑动窗口 ZREMRANGEBYSCORE |
| Worker 状态 | Pod IP、GPU 利用率、队列深度 | 健康检查每 5s 更新 | Gateway 路由表消费 |
| Scheduler 状态 | 调度队列、优先级 | Zealot Scheduler 实时读写 | 低延迟调度 |
| 路由表热更新 | pubsub channel | 路由变更时 publish | Gateway subs 自动重载 |
| Session 缓存 | 多轮对话上下文 | 每轮读写 | 可选——也可以存 PostgreSQL JSONB |

### Observability — ClickHouse（Phase 1 定义 schema）

GPU 指标增长速度远超业务数据。几十台 GPU，每 15s 一条 = 每天 100 万条。PostgreSQL 可以存但会越来越慢。

ClickHouse 列存 + 高压缩比 + 向量化查询，聚合查询几乎瞬间返回。

**Phase 1 就定义 ClickHouse schema**，即使不立即部署。后续迁移不需要重新设计数据模型。

核心表：
- `gpu_metrics`：utilization, memory, temperature, power, tokens/s, per GPU per node
- `request_events`：request_id, org, model, input_tokens, output_tokens, latency, cost, status（从 PostgreSQL 异步复制，分析副本，非 source of truth）
- `audit_events`：user_id, action, resource, timestamp

### Observability — Loki + S3

日志分三类存储，不混在一起：

| 类别 | 内容 | 标签 |
|------|------|------|
| **App Logs** | Console API、Gateway、Auth Service 日志 | `{service, level}` |
| **Inference Logs** | vLLM/Zealot 推理日志 | `{model, request_id, level}` |
| **Audit Logs** | 敏感操作审计 | `{user_id, action, resource}` |

推理日志默认 level=warn（不要 debug），否则 Loki 被海量调试日志淹没。

### Artifact — S3 / MinIO

推理平台必须有大文件存储——模型权重动辄几十 GB。S3/MinIO 作为统一对象存储：

| 数据类型 | 大小 | 访问模式 |
|---------|------|---------|
| 模型权重 | 6-140GB | Worker 启动时拉取，节点本地缓存 |
| Tokenizer | < 10MB | 随模型一起加载 |
| LoRA 权重 | 10MB - 1GB | Dedicated 用户上传 |

Worker 启动时从 S3 拉取模型 → 缓存到本地 SSD → 后续 Pod 重启秒级加载。

### ClickHouse 是否替代 Loki？

保持各自职责。ClickHouse 做结构化指标（GPU、请求事件），Loki 做非结构化日志。合并会增加 ClickHouse 存储成本和查询复杂度。两者通过 Grafana 统一面板即可，不需要存储层合并。

---

## Consequences

**正面：**
- 四个领域边界清晰，未来换存储不影响其他领域
- Phase 1 只需运行 PostgreSQL + Redis + Loki（3 个服务），ClickHouse 可推迟部署但 schema 提前定义
- Redis 作为毫秒级热数据层，Gateway/Scheduler 的关键路径延迟可控
- S3/MinIO 统一存放模型、LoRA、导出，不需要管理 PV

**负面：**
- 比单体数据库多了 3-4 个存储服务，运维复杂度增加
- ClickHouse schema 提前定义但推迟部署可能造成"定义了没用上"的浪费
- Redis 成为关键路径依赖——挂了需要本地缓存降级撑 5 分钟

**待跟进：**
- PostgreSQL migration 工具选择（prisma vs knex vs sea-orm）
- ClickHouse schema 设计（GPU metrics + request events + audit events 三表）
- Redis 持久化策略（AOF + RDB 快照）
- PostgreSQL 备份策略（WAL 归档 + PITR + 每日全量备份）
- Event Bus（Phase 2 引入 NATS/Kafka 解耦计费、审计、通知）

---

## 决策对比

| 决策 | 选择 | 理由 | 日期 |
|------|------|------|------|
| 数据组织 | 按领域（Control/Data/Observability/Artifact），非按技术 | 底层换存储不影响架构 | 2026-07-11 |
| 主存储 | PostgreSQL | 关系型、事务、团队熟悉 | 2026-07-10 |
| 热数据 | Redis | 毫秒级、Gateway 关键路径依赖 | 2026-07-11 |
| 时序数据 | ClickHouse | 列存、高压缩、GPU 指标查询快 | 2026-07-11 |
| 日志 | Loki + S3 | 低成本、与 Grafana 统一 | 2026-07-11 |
| 对象存储 | S3 / MinIO | 模型权重、LoRA、导出文件 | 2026-07-11 |
