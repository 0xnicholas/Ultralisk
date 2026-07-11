# Ultralisk 架构设计

> **版本**：v0.2  
> **日期**：2026-07-11  
> **范围**：全栈架构（推理平台 + 控制台 + 自研引擎路线）

---

## 1. 架构总览

> 设计依据：ADR-000（Platform Object Model）、ADR-001（云原生推理平台架构）
> 对象定义见 ADR-000。本图展示对象如何跨越三层流动。

```
                          ┌──────────────────────┐
                          │       Client         │
                          │  Web Console │ SDK   │
                          └──────────┬───────────┘
                                     │ HTTPS
                          ┌──────────▼───────────┐
                          │    Cloud LB / WAF    │  TLS + DDoS
                          └──────────┬───────────┘
                                     │ HTTP
    ┌────────────────────────────────▼─────────────────────────────────┐
    │                        GATEWAY                                  │
    │  ┌──────────────────────────────────────────────────────────┐  │
    │  │  Gateway (Rust)     §2                            │  │
    │  │  auth → ratelimit → route → proxy → observe              │  │
    │  └──────┬──────────────────────┬────────────────────────────┘  │
    └─────────┼──────────────────────┼───────────────────────────────┘
              │                      │
   管理流量   │                      │ 推理流量
   /v1/admin/*│                      │ /v1/chat/*
              ▼                      ▼
    ┌──────────────────┐    ┌──────────────────────────────┐
    │  CONTROL PLANE   │    │        DATA PLANE            │
    │  §3              │    │                              │
    │ ┌──────────────┐ │    │  ┌───────────────────────┐  │
    │ │ Console API  │ │    │  │  Runtime Interface    │  │  §4.6
    │ │ (TypeScript) │ │    │  │  (gRPC)               │  │
    │ └──────────────┘ │    │  └───┬───────┬───────┬───┘  │
    │ ┌──────────────┐ │    │      │       │       │      │
    │ │ Auth Service │◄─┼────┼──┌───▼──┐ ┌──▼──┐ ┌──▼───┐│
    │ │ (Rust)       │ │    │  │ vLLM │ │Zealot│ │SGLang││  §4
    │ └──────────────┘ │    │  │Backend│ │Backend│ │Backend││
    │ ┌──────────────┐ │    │  └───┬──┘ └──┬──┘ └──┬───┘│
    │ │ Billing Svc  │ │    │      │ Zealot Scheduler│    │  §4
    │ └──────────────┘ │    │      │     (自研)      │    │
    └──────────────────┘    │      │                 │      │
                            │  ┌───▼──────▼──────▼───┐  │
                            │  │   KAI Scheduler    │  │  §5
                            │  │   (集群资源调度)    │  │
                            │  └──────────┬─────────┘  │
                            │  ┌──────────▼─────────┐  │
                            │  │  K8s + GPU 集群    │  │  §6
                            │  │  H100 / A100 Nodes │  │
                            │  └────────────────────┘  │
                            └──────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────┐
    │                    OBSERVABILITY                  §7         │
    │  Prometheus (GPU 指标) │ Loki (日志) │ Grafana │ AlertMgr   │
    └──────────────────────────────────────────────────────────────┘
```

**分层职责**：

| 层 | 职责 | 组件 |
|---|------|------|
| **Gateway** | 认证、token 限流、body-based 模型路由、SSE 透传与计费 | Gateway (Rust) |
| **Control Plane** | 管理编排、CRUD、计费、审计 | Console API + Auth Service + Billing |
| **Data Plane** | 推理执行：Runtime I/F → Backend → 引擎 → KAI 集群调度 → GPU | Zealot / vLLM / SGLang + KAI Scheduler + K8s |

---

## 2. Gateway（推理网关层）

### 2.1 定位

Gateway 是整个推理平台的统一入口，自研 Rust 实现。负责：API Key 认证、token 级别限流、body-based 模型路由、SSE 流式透传与计费侧录。

上游由云平台 LB（AWS ALB / GCP LB）处理 TLS termination 和 DDoS 防护。Gateway 本身只做推理路由逻辑，不做 TLS。

详见 ADR-002。

### 2.2 技术选型：自研 Rust

弃用 Kong 的原因：Kong 的 URL-based 路由模型和 AI 推理的 body-based 路由需求根本不匹配。Kong 读 body 需要缓冲，缓冲和 SSE 流式透传冲突。详见 ADR-002。

Gateway 用 Rust 实现，和 Zealot 推理引擎同一技术栈，约 3-5 KLOC。

### 2.3 处理链 (Middleware Stack)

```
请求 → authenticate → ratelimit → route → proxy → observe
          │              │           │        │        │
      验 API Key      滑动窗口    查 model  SSE tee  Prometheus
      (Redis 缓存)    token配额    → pool    +计费    metrics
```

用 Rust `tower` 的 middleware 模型实现分层处理。路由表通过 `ArcSwap` 无锁热替换，更新路由不丢连接。

### 2.4 路由逻辑

```
POST /v1/chat/completions
body: { "model": "llama-3.3-70b-instruct", "messages": [...], "stream": true }
                           │
                  ┌────────▼───────────┐
                  │  Gateway    │
                  │                    │
                  │ 1. 认证 API Key    │
                  │    → 注入 user_id  │
                  │                    │
                  │ 2. Token 限流检查  │
                  │    → Redis 滑动窗口│
                  │                    │
                  │ 3. 解析 body       │
                  │    model + stream  │
                  │                    │
                  │ 4. 查路由表        │
                  │    model → Pool    │
                  │    serverless →    │
                  │      least-conn   │
                  │    dedicated →    │
                  │      sticky       │
                  │                    │
                  │ 5. SSE 透传        │
                  │    主路径 → client │
                  │    侧录 → billing  │
                  └────────────────────┘
```

### 2.5 部署策略路由

Gateway 不区分"Serverless vs Batch vs Dedicated"——它只根据 model 字段查路由表。策略由 Policy Engine（Zealot Scheduler 内置）在引擎层应用。

| 策略 | Phase | Queue | Batch 策略 | Isolation | 计费 |
|------|-------|-------|-----------|-----------|------|
| **Serverless** | 1 | 交互 | Dynamic (2-5ms) | 共享 | per token |
| **Batch** | 1 | 批处理 | Aggressive (60s) | 共享 | per token |
| **Reserved** | 2 | 交互 | Dynamic | 软隔离 | per TPS |
| **Dedicated** | 3 | 交互 | Small | 硬隔离 | per GPU-hr |

详见 ADR-005。

### 2.6 冷启动处理

当请求的模型不在 GPU 上时（Serverless 场景）：

```
请求 model=llama-70b → 路由表：pool 为空（模型未加载）
  → 不返回 503
  → 请求进入等待队列
  → 触发 KAI Scheduler 分配 GPU 并加载模型
  → 模型就绪后从队列取出请求
  → SSE 流式返回响应
```

### 2.7 借鉴 Kong 的五个设计

| 设计 | 用途 |
|------|------|
| Phase 执行链 | `tower` middleware 组合 authenticate→ratelimit→route→proxy→observe |
| 优雅重载 | `ArcSwap` 无锁路由表热替换，已有连接不受影响 |
| 滑动窗口限流 | Redis sorted set → token-based（非请求计数） |
| 健康检查三层 | Active `/metrics` poll + Passive error observe + Circuit breaker（OOM 熔断 30s） |
| Metrics 分类 | per-model, per-pool, per-phase histogram |

---

## 3. Control Plane（管控层）
> 设计依据：ADR-006（数据存储）、ADR-008（认证方案）

### 3.1 服务拆分

```
Console API 目前是单体 Express，后续可拆分为微服务：

┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐
│ Auth Service │  │ Endpoint Mgr │  │ Billing Svc  │  │ Model Registry│
│              │  │              │  │              │  │               │
│ login/logout │  │ CRUD         │  │ usage track  │  │ model list    │
│ JWT issue    │  │ scale up/dn  │  │ invoicing    │  │ model detail  │
│ API key CRUD │  │ autoscaling  │  │ balance      │  │ pricing       │
│ invite       │  │ metrics      │  │ alerts       │  │ capabilities  │
│ RBAC         │  │              │  │              │  │               │
└─────────────┘  └──────────────┘  └──────────────┘  └───────────────┘

┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐
│ Org Manager │  │ Incident Mgr │  │Batch Job Mgr │  │ Session Store │
│              │  │              │  │              │  │               │
│ org CRUD     │  │ alert → inc  │  │ job CRUD     │  │ playground    │
│ members      │  │ AI diagnosis │  │ status track │  │ chat history  │
│ projects     │  │ auto-remed.  │  │ result store │  │               │
│              │  │ action log   │  │ callback     │  │               │
└─────────────┘  └──────────────┘  └──────────────┘  └───────────────┘
```

### 3.2 数据存储选型

按四个数据领域组织，而非按数据库技术划分：

| 领域 | 存储 | 内容 |
|------|------|------|
| **Control Plane** | PostgreSQL | 用户、组织、API Key、模型元数据、Endpoint、Deployment、计费配置、用量聚合 |
| **Data Plane** | Redis | API Key 验证缓存、Rate Limit 计数器、Worker 状态、Scheduler 状态、路由表缓存 |
| **Observability** | ClickHouse + Loki/S3 | GPU 指标 + 请求事件（ClickHouse）；应用/推理/审计日志（Loki） |
| **Artifact** | S3 / MinIO | 模型权重、Tokenizer、LoRA、导出文件 |

Phase 1 运行 PostgreSQL + Redis + Loki（3 个服务）。ClickHouse 在 Phase 1 定义 schema，可推迟部署。详见 ADR-006。

### 3.3 当前状态（Phase 1a Mock）

```
实际代码：console/console-api/src/index.ts
├── 单文件 Express app，端口 3100
├── 18 个 API 路由组，全部返回 Mock 数据
├── 无数据库（fixtures.ts 内存常驻）
├── 无认证（所有端点无需 token）
└── /v1/chat/completions 有 SSE 流式 mock
```

---

## 4. Inference Engine（推理引擎层）

> 设计依据：ADR-003（引擎选型）、ADR-005（Policy Engine）、ADR-009（语言栈）、ADR-010（Backend Runtime）

### 4.1 技术路线：vLLM 基线 → Zealot 自研

Ultralisk 的推理引擎走 **fork + 逐步替换** 路线，而非从头自研或永久使用开源版。

```
Phase 1（1-3 月）          Phase 2（4-6 月）           Phase 3（7-12 月）
─────                     ──────                     ────
vLLM (vanilla)      →    vLLM fork + CUDA 优化  →    Zealot (自研引擎)
                          │                            │
                          ├─ Attention kernel          ├─ 完整自研栈
                          ├─ 自定义量化                 ├─ 定价护城河
                          ├─ Prefill/Decode 分离       ├─ 性能对标 Together TIE
                          └─ Speculative decode        └─ 5-8 人引擎团队
```

**核心策略**：保留 vLLM 的模型加载、API 服务、PagedAttention 内存管理，只替换 GPU 上的关键 kernel。详见 ADR-003。

### 4.2 推理流水线

```
                   Request In
                       │
                       ▼
              ┌────────────────┐
              │  Tokenizer     │  ← tokenize prompt
              └───────┬────────┘
                      │ seq of token IDs
                      ▼
              ┌────────────────────┐
              │  Prefill           │  ← 并行处理全部 prompt tokens
              │  (KV cache 构建)    │
              │  ┌──────────────┐  │
              │  │ Zealot optimized│  │  ← Phase 3: 自定义 attention kernel
              │  │ attention    │  │     针对 H100/B200 优化
              │  └──────────────┘  │
              └───────┬────────────┘
                      │
              ┌───────▼────────────┐
              │  Prefill-Decode    │  ← Phase 2+: 分离调度
              │  Disaggregation    │     prefill 和 decode 跑在不同 GPU
              │  (可选优化)         │     各自独立扩缩容
              └───────┬────────────┘
                      │
                      ▼
              ┌────────────────────┐
              │  Decode            │  ← 逐 token 自回归生成
              │  (token by token)   │
              │  ┌──────────────┐  │
              │  │ Paged /      │  │  ← vLLM 核心 + SGLang 借鉴
              │  │ Radix Attn   │  │     RadixAttention 前缀共享
              │  └──────────────┘  │
              │  ┌──────────────┐  │
              │  │ Speculative  │  │  ← Phase 2+: draft model 加速
              │  │ Decoding     │  │
              │  └──────────────┘  │
              └───────┬────────────┘
                      │ streaming tokens
                      ▼
              ┌────────────────┐
              │  Detokenizer   │
              └───────┬────────┘
                      │
                      ▼
                  Response Out
                  (SSE stream)
```

### 4.3 Zealot 优化路线图

| 优化 | Phase | 预期提升 | 技术来源 |
|------|-------|---------|---------|
| Baseline（vLLM vanilla） | 1 | 基准 | 开源 vLLM |
| AWQ INT4 量化部署 | 1 | 2x 显存节省 | 开源 |
| Attention kernel 优化 | 2 | 20-40% 吞吐 | FA-3/FA-4 调参 |
| 自定义量化微调 | 2 | 额外 20% 显存 | AWQ 改进 |
| Prefill-Decode 分离调度 | 2 | 30-50% GPU 利用率 | CPD (Together) |
| Speculative Decoding | 2 | 1.5-2x 小模型 | Medusa/Eagle |
| RadixAttention 前缀共享 | 3 | 10x KV cache 节省 | SGLang 借鉴 |
| 全局 Continuous Batching 公平调度 | 3 | 尾延迟降低 | 自研 |

### 4.4 Pod 规格参考

| 模型 | GPU | 量化 | 显存占用 | 预期 QPS per GPU |
|------|-----|------|---------|-----------------|
| Llama 3.1 8B | A100-40GB x1 | AWQ INT4 | ~6GB | ~200-400 |
| Llama 3.3 70B | H100-80GB x2 | AWQ INT4 | ~40GB | ~50-100 |
| DeepSeek V4 Pro | H100-80GB x2 | FP8 | ~70GB | ~30-60 |
| Qwen 2.5 72B | H100-80GB x1 | AWQ INT4 | ~38GB | ~40-80 |

### 4.5 Zealot 语言栈：Python 做胶水，Rust 做内核，CUDA 做计算

Zealot 不是全量重写 vLLM，而是**组件级替换**——保留 Python 兼容层，用 Rust 替换内存管理和约束解码，CUDA 不动。

**语言分工：**

```
              ┌──────────────────────────────────┐
              │         Zealot 内部语言分层          │
              │                                  │
  Python ────►│  API Server (FastAPI)            │ ← Phase 1-2 保留
              │  Model Loader (HF 生态)          │ ← 永久保留（社区同步）
              │                                  │
  Rust ──────►│  Scheduler                       │ ← Phase 3 替换（GC tail latency）
              │  Block Manager (KV cache 管理)   │ ← Phase 2 替换（内存安全）
              │  Constrained Decode Engine       │ ← Phase 2 替换（CPU 侧加速）
              │                                  │
  CUDA/C++ ──►│  Attention Kernel                │ ← 改装（FA-3, 自定义 tile）
              │  MLP / GEMM                      │ ← 不动（CUTLASS 已最优）
              │  Quantization Kernel             │ ← 改装（per-layer mixed precision）
              │  Sampling                        │ ← 不动
              └──────────────────────────────────┘
```

**为什么 Rust 不改 Attention Kernel？**

Attention kernel 是 CUDA，跑在 GPU 上。Rust 在这里只能是"调用 CUDA kernel 的外壳"——和 Python 做同样的事。一次 decode step 的耗时分解：

```
Scheduler 决策:    ~50μs   ← 这个可以用 Rust 加速，但不是瓶颈
Attention kernel: ~20ms   ← CUDA，Rust 不能碰
MLP:               ~15ms   ← CUDA，Rust 不能碰
Sampling:          ~5μs    ← CUDA，Rust 不能碰
```

Python 在整个延迟链上占不到 0.2%。Rust 重写 Python 层，GPU 性能**一毫秒都不会快**。

**那 Rust 到底解决什么？**

| 问题 | Python 现状 | Rust 方案 | Phase |
|------|------------|----------|-------|
| **Tail Latency** — GC 暂停导致 P99 抖动 | Scheduler 在 Python 里随机被 GC 打断 | 无 GC，延迟分布更窄 | 3 |
| **KV Cache 内存安全** — 跨请求 block 泄漏 | 手动引用计数，无编译期检查 | Ownership 编译期阻止 use-after-free | 2 |
| **Constrained Decode** — token 校验的 CPU 开销 | `outlines` 库在 Python 里跑 | `xgrammar`（Rust）做 GPU 侧约束 | 2 |
| **冷启动** — 模型加载时 Python 的解释开销 | tokenizer 走 Python ↔ Rust FFI，有拷贝 | 直接用 Rust tokenizer，零拷贝 | 3 |

**替换路线：**

```
Phase 1（1-3 月）           Phase 2（4-6 月）              Phase 3（7-12 月）
─────                      ──────                        ────
100% Python                80% Python + Rust 内核        50% Python + Rust 内核
                            │                             │
                            ├── Rust Block Manager       ├── Rust Scheduler
                            │   替代手动引用计数           │   消除 GC tail latency
                            │                             │
                            ├── Rust Constrained Decode   ├── Rust Tokenizer
                            │   对标 SGLang xgrammar      │   零拷贝 tokenization
                            │                             │
                            └── Python ←→ Rust FFI       └── Python 仅做兼容层
                               通过 PyO3 绑定              （Model Loader + API Server）
```

**为什么不全量重写？**

全量重写 vLLM 在 Rust 里是 3-5 人 12-18 个月，且会丢失对新模型的快速支持（vLLM 社区 1-2 周适配新模型的能力靠 Model Loader 的一致性）。组件级替换的好处是：每个新模型发布时仍能通过 Python 兼容层快速支持，同时 Rust 内核独立演进。

### 4.6 Backend Runtime：推理引擎可替换抽象

Gateway 和 Control Plane 不直接耦合到 vLLM 或 Zealot 的具体实现。所有推理能力通过一组标准 gRPC 接口暴露——**Runtime Interface**——每个引擎实例化为一个 **Backend Runtime**。详见 ADR-010。

```
Gateway / Control Plane
        │ gRPC
  ┌─────▼──────┐
  │Runtime I/F │  ← 逻辑边界（proto 定义）
  └──┬──┬──┬──┘
     │  │  │
  ┌──▼┐ ┌▼─┐ ┌─▼───┐
  │vLLM│ │Z │ │SGLang│  ← Backend Runtimes
  │适配│ │内嵌│ │适配  │
  └──┬┘ └┬─┘ └──┬──┘
     │    │      │
  vLLM  Zealot  SGLang Pod
```

**实现方式**：
- vLLM/SGLang Backend：Rust sidecar 做 gRPC ↔ OpenAI HTTP 协议转换
- Zealot Backend：直接实现 Runtime Interface trait，零开销

**核心能力**：引擎演进透明、多引擎共存、A/B 测试分流、私有化可插拔。

**关键 RPC**：`Infer`（双向流，支持 cancel）、`LoadModel/UnloadModel`（与 KAI Scheduler 协作）、`HealthCheck`（结构化 GPU 状态）。

---

## 5. KAI Scheduler（GPU 调度层）

### 5.1 定位

> 设计依据：ADR-004（KAI Scheduler）

推理平台有三层调度，KAI Scheduler 是**最底层的基础设施调度器**：

```
Gateway          ← 请求路由：哪个请求 → 哪个 Pool（毫秒级）
        │
Zealot Scheduler     ← 推理调度：合批、KV Cache、Prefill/Decode（毫秒级）
  (Zealot Engine 内部)    自研，核心竞争力
        │
Backend Runtime         ← 引擎抽象
        │
KAI Scheduler           ← 集群资源调度：Pod → GPU Node（分钟级）
        本文讨论的这一层
```

KAI Scheduler 是 NVIDIA 开源的集群资源调度器（前身 Run:ai），负责 **Pod 级别的 GPU 资源分配**：哪个 Pod 去哪个 Node 的哪几张 GPU。它和上层的 Zealot Scheduler 不是竞争关系，而是上下两层、互相配合。

### 5.2 核心能力

```
┌──────────────────────────────────────────────────┐
│                 KAI Scheduler                     │
│                                                  │
│  ┌──────────────┐  ┌──────────────┐             │
│  │ GPU Pool     │  │ Gang         │             │
│  │ Partitioning │  │ Scheduling   │             │
│  │ (配额分配)    │  │ (多GPU原子级) │             │
│  └──────────────┘  └──────────────┘             │
│  ┌──────────────┐  ┌──────────────┐             │
│  │ Fair Share   │  │ Bin Packing  │             │
│  │ (公平调度)    │  │ (紧凑装箱)    │             │
│  └──────────────┘  └──────────────┘             │
│  ┌──────────────┐  ┌──────────────┐             │
│  │ Preemption   │  │ GPU Fraction │             │
│  │ (抢占/优先级) │  │ (GPU 切分)   │             │
│  └──────────────┘  └──────────────┘             │
└──────────────────────────────────────────────────┘
```

### 5.3 职责边界：集群资源调度 vs 推理请求调度

KAI Scheduler 和 Gateway 调度的是完全不同的东西：

```
                    调度域对比

    集群资源调度 (KAI Scheduler)      推理请求调度 (Gateway)
    ─────────────────────────        ──────────────────────────────
    对象: GPU 卡、显存、NVLink 拓扑   对象: 每个 /v1/chat 请求
    粒度: 分钟级 (部署/扩缩/回收)     粒度: 毫秒级 (每个 HTTP 请求)
    问题: 这个 Pod 放哪个 Node？      问题: 这个请求发哪个 Pod？
    触发: Backend Runtime.LoadModel() 触发: 每个 API 调用
```

**KAI Scheduler 做的**：
- 创建推理 Pod 时选择最优 GPU Node
- 多 GPU 原子分配（Gang Scheduling）
- 紧凑装箱减少碎片（Bin Packing）
- 团队间 GPU 配额管理

**KAI Scheduler 不做的**（归 Gateway）：
- 请求级负载均衡
- 冷启动排队
- 根据 model 字段路由
- Token 限流

### 5.4 为什么需要 KAI Scheduler

原生 K8s scheduler 按 CPU/内存调度，**不理解 GPU 拓扑**。KAI Scheduler 解决：

| 问题 | KAI Scheduler 方案 |
|------|-------------------|
| 两个 Pod 争抢同一张卡的显存 | Bin packing：优先填满一张卡再分配下一张 |
| 大模型需要多张 GPU，但碎片化 | Gang scheduling：原子分配，要么全分要么等 |
| 不同团队公平使用 GPU | Fair share：根据配额分配，防止资源垄断 |
| 紧急推理 vs 批处理优先级 | Preemption：高优任务可抢占低优 |

### 5.5 调度决策流程

```
部署请求: "部署 Llama 70B, 需要 2x H100, 优先级 P1"
                │
                ▼
┌───────────────────────────────────────┐
│          KAI Scheduler                │
│                                       │
│  1. 检查 GPU Pool 可用的 H100         │
│     cl_001: 6/8 空闲 (2 在跑 Llama8B) │
│     cl_002: 2/4 空闲 (2 在跑 DeepSeek)│
│     cl_003: 全部 A100 ❌              │
│                                       │
│  2. Gang check: cl_001 够 2 张       │
│     ✅ 可以原子分配                   │
│                                       │
│  3. Bin packing: 选 node_001          │
│     因为 node_001 已有 1 个服务，     │
│     再放 1 个填满比散开好             │
│                                       │
│  4. 结果: 分配 node_001 GPU3, GPU4    │
│     → K8s 创建 vLLM Pod 绑定到这两张卡 │
└───────────────────────────────────────┘
```

### 5.6 控制台如何体现 Scheduler

```
Console UI                         KAI Scheduler API
─────                              ─────
Clusters 页面
├── 集群列表 (cl_001/002/003) ←── GET /scheduler/clusters
│   └── 健康状态 / GPU 利用率   ←── GET /scheduler/clusters/:id/stats
│
Nodes 页面
├── 节点列表                  ←── GET /scheduler/nodes
│   └── 每卡利用率、温度、进程  ←── GET /scheduler/nodes/:id/gpus
│
Deployments 页面
├── 部署列表                  ←── GET /scheduler/deployments
│   ├── Scale Up               ←── POST /scheduler/deployments/:id/scale
│   ├── Rollback               ←── POST /scheduler/deployments/:id/rollback
│   └── 版本历史               ←── GET /scheduler/deployments/:id/versions
```

> **注意**：目前 Deployments 页面通过 Console API 的 mock 数据展示。接入 KAI Scheduler 后，Console API 改为调用 KAI Scheduler 的集群资源 API 获取真实数据。推理请求的路由仍然由 Gateway 处理，不走 KAI Scheduler。

---

## 6. Cluster & Node（基础设施层）

### 6.1 资源层级

```
Organization          ← 企业客户
  └── Project         ← 团队/业务线
       └── Endpoint   ← 推理端点 (用户创建)
            └── Deployment  ← K8s 上的具体部署

物理层级（用户不可直接操作，但可在 Operations 视图查看）：

Cluster (集群)                       → 一个机房/Region 的 K8s 集群
  └── Node (节点)                    → 一台物理服务器
       ├── GPU Card 0                  → 单张 GPU 卡
       │   ├── utilization_percent
       │   ├── memory_used / total
       │   ├── temperature
       │   └── processes
       ├── GPU Card 1
       └── ...
```

### 6.2 Phase 1 规划

| Region | Cluster ID | GPU 类型 | 节点数 | 总 GPU 数 | 用途 |
|--------|-----------|---------|--------|----------|------|
| us-east-1 | cl_001 | H100-80GB | 8 | 64 | 生产推理 |
| us-west-2 | cl_002 | H100-80GB | 4 | 32 | 灾备 + 溢出 |
| eu-central-1 | cl_003 | A100-40GB | 2 | 8 | 开发/测试 |

### 6.3 网络拓扑

```
                          Internet
                             │
                     ┌───────▼───────┐
                     │   Cloud LB    │
                     │ (TLS termination)│
                     └───────┬───────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
       ┌──────▼──────┐ ┌────▼─────┐ ┌─────▼──────┐
       │ us-east-1   │ │us-west-2 │ │eu-central-1│
       │ VPC         │ │VPC       │ │VPC         │
       │ 10.0.0.0/16 │ │10.1.0.0  │ │10.2.0.0    │
       │             │ │          │ │            │
       │ K8s Control │ │K8s Ctl   │ │K8s Ctl     │
       │ Plane ×3    │ │Plane ×3  │ │Plane ×1    │
       │             │ │          │ │            │
       │ Worker Pool │ │Worker    │ │Worker      │
       │ gpu-h100    │ │gpu-h100  │ │gpu-a100    │
       │ 8 nodes     │ │4 nodes   │ │2 nodes     │
       │             │ │          │ │            │
       │ ┌─────────┐ │ │          │ │            │
       │ │ NVLink  │ │ │          │ │            │
       │ │ (node内 │ │ │          │ │            │
       │ │  GPU间) │ │ │          │ │            │
       │ └─────────┘ │ │          │ │            │
       │             │ │          │ │            │
       │ ┌─────────┐ │ │          │ │            │
       │ │ 100Gbps │ │ │←─ 专线 ─→│ │            │
       │ │ Backbone│ │ │  (跨Region│ │            │
       │ └─────────┘ │ │   互连)  │ │            │
       └─────────────┘ └──────────┘ └────────────┘
```

### 6.4 单个 Node 内部结构

```
┌────────────────────────────────────────────────┐
│  Node: gpu-n01 (H100 × 8)                      │
│                                                │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐          │
│  │GPU 0 │ │GPU 1 │ │GPU 2 │ │GPU 3 │          │
│  │vLLM  │ │vLLM  │ │vLLM  │ │vLLM  │          │
│  │Llama │ │Llama │ │Llama │ │Deep  │          │
│  │70B   │ │70B   │ │8B    │ │Seek  │          │
│  └──────┘ └──────┘ └──────┘ └──────┘          │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐          │
│  │GPU 4 │ │GPU 5 │ │GPU 6 │ │GPU 7 │  [idle]  │
│  │vLLM  │ │      │ │      │ │      │          │
│  │Llama │ │ idle │ │ idle │ │ idle │          │
│  │8B    │ │      │ │      │ │      │          │
│  └──────┘ └──────┘ └──────┘ └──────┘          │
│                                                │
│  ┌─────────────────────────────────────────┐  │
│  │          NVLink Switch                  │  │
│  │  900 GB/s GPU-to-GPU 互联 (node 内部)    │  │
│  └─────────────────────────────────────────┘  │
│                                                │
│  CPU: 2× AMD EPYC (128 cores)                 │
│  RAM: 1TB DDR5                                 │
│  Storage: 4× NVMe SSD (RAID 0)                │
│  NIC: 2× 100Gbps (bond)                       │
└────────────────────────────────────────────────┘
```

---

## 7. Observability（可观测性）

> 设计依据：ADR-007（可观测性栈）

### 7.1 技术栈

```
数据源                         采集                  短期存储          长期存储         可视化/告警
─────                          ──                  ──              ──              ──────
Zealot/vLLM metrics ───┐
K8s metrics ───────────┤
GPU metrics (DCGM) ────┼──→ Prometheus ──── 15天保留 ──→ ClickHouse ──→ Grafana
Gateway metrics ───────┤                                          (分析查询)      (统一面板)
Node metrics (node_exp)┘                                                │
                                                                        ├──→ AlertManager
App Logs ──────────────┐                                                │    (规则引擎)
Inference Logs ────────┼──→ Promtail ──→ Loki (S3) ─────────────────────┤
Audit Logs ────────────┘                                                ├──→ Slack/Email
                                                                        │
                                                                  控制台内嵌 Grafana iframe
```

存储分工：
- **Prometheus**：实时告警 + 短期监控面板（15 天）
- **ClickHouse**：长期存储 + 分析查询（GPU 指标、请求事件、审计事件）。Phase 1 定义 schema，Phase 2 部署
- **Loki + S3**：三类日志（应用/推理/审计），低成本长期存储
- **Grafana**：统一面板——Prometheus + ClickHouse + Loki 三个数据源

### 7.2 核心指标

| 类别 | 指标 | 来源 | 存储 |
|------|------|------|------|
| **业务** | QPS、token 消耗、费用 | Gateway + Billing | PostgreSQL（计费 source of truth） + ClickHouse（分析副本） |
| **推理** | TTFT、TPOT、error_rate | Zealot/vLLM /metrics | Prometheus (实时) + ClickHouse (长期) |
| **GPU** | utilization、memory、temperature | DCGM Exporter | Prometheus (实时) + ClickHouse (长期) |
| **集群** | node status、pod count、restarts | K8s metrics-server | Prometheus |
| **队列** | queue depth、wait time | Zealot Scheduler | Prometheus |

### 7.3 AI 诊断（Phase 2d）

Incident 系统集成 LLM 进行自动根因分析：

```
Prometheus Alert 触发
        │
        ▼
┌───────────────────────────┐
│  Incident 自动创建         │
│  - 收集关联 metrics 时序   │
│  - 收集关联 logs           │
│  - 构建诊断 prompt         │
└───────────┬───────────────┘
            │
            ▼
┌───────────────────────────┐
│  AI Diagnosis (内部 LLM)   │
│  prompt = {                │
│    incident description    │
│    + recent metrics        │
│    + recent logs           │
│    + known patterns        │
│  }                         │
│  → analysis: {             │
│      root_causes: [...]    │ ← 按 confidence 排序
│      recommendations: [...]│
│    }                       │
└───────────┬───────────────┘
            │
            ▼
┌───────────────────────────┐
│  Auto-Remediation         │
│  Tier 1: 自动执行         │ ← 重启 vLLM worker
│  Tier 2: 需审批           │ ← Scale up
│  Tier 3: 人工干预         │ ← Node reboot
└───────────────────────────┘
```

---

## 8. 请求全链路（核心流程）

### 8.1 一次 Chat Completion 请求的完整路径

```
Step 1: 客户端发送请求
────────────────────────
POST https://api.ultralisk.com/v1/chat/completions
Authorization: Bearer ultr_abc123...
Content-Type: application/json
{
  "model": "llama-3.3-70b-instruct",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": true
}


Step 2: Gateway 接收
────────────────────────
├── TLS termination (Cloud LB)
├── Auth Plugin: 解析 API Key
│   val key = Redis.get("apikey:abc123") → { user_id, org_id, quota }
│   if not valid → 401
│   if quota < 0 → 429
├── Rate Limiter: key_abc123 本分钟已 45/60 请求 → 放行


Step 3: Model Router 查路由
────────────────────────
├── Lookup: model_id = "llama-3.3-70b-instruct"
│   → deployment_type: serverless
│   → target_pool: "serverless-llama70b"
│   → healthy_pods: ["vllm-70b-01", "vllm-70b-02"]
├── Select: least-connections → "vllm-70b-01"
├── Forward: POST http://vllm-70b-01.svc.cluster.local:8000/v1/chat/completions


Step 4: vLLM 推理
────────────────────────
├── Tokenizer: "Hello" → [9906]
├── Prefill: 构建 KV cache
├── Decode: 生成 tokens (streaming)
│   SSE event: {"choices":[{"delta":{"content":"Hi"}}]}
│   SSE event: {"choices":[{"delta":{"content":" there"}}]}
│   SSE event: {"choices":[{"delta":{"content":"!"}}]}
│   SSE event: {"choices":[{"finish_reason":"stop"}]}
│   SSE event: [DONE]
└── Metrics 记录: tokens, latency, gpu_util


Step 5: Gateway 流式转发
────────────────────────
├── 透传 SSE 到客户端
├── 提取 usage: { prompt_tokens: X, completion_tokens: Y }
├── 写入用量事件 → Billing Service


Step 6: Billing 计费
────────────────────────
├── Lookup pricing: $0.59/1M input, $0.79/1M output
├── Calculate cost: X*0.59 + Y*0.79
├── Deduct balance
├── Update usage metrics (TimescaleDB)
└── Check budget alert thresholds
```

### 8.2 一次 Serverless → Dedicated 的端点创建

```
用户操作: Console UI → Create Endpoint
─────────────────────────────────────────
POST /v1/admin/endpoints
{ "name": "my-llama-prod", "model_id": "llama-3.3-70b", "type": "dedicated" }

        │
        ▼
Console API
├── 验证用户权限 (admin role)
├── 检查配额 (是否超过 GPU limit)
├── 创建 Endpoint 记录 (PostgreSQL)
│   ep_xxx: { status: "provisioning", replicas: 0 }
│
├── 调用 KAI Scheduler
│   POST /scheduler/deployments
│   { "model": "llama-3.3-70b-instruct",
│     "gpu_type": "H100",
│     "gpu_count": 2,
│     "replicas": 1,
│     "priority": "normal" }
│
├── KAI Scheduler 决策
│   ├── Find: H100 GPUs with 2 free slots
│   │   cl_001, node_005, GPU3 + GPU4
│   ├── Allocate: bind GPU to new pod
│   └── Return: deployment_id = dep_xxx
│
├── K8s 创建 Pod
│   ├── Pull image: vllm:v0.8.3
│   ├── Mount model volume
│   ├── Start vLLM API server
│   └── Health check: GET /health → 200
│
├── Gateway 路由表更新
│   PUT /kong/routes/llama-70b-dedicated/dep_xxx
│
├── Endpoint status → "active"
│
└── 返回 Console UI
    { "id": "ep_xxx", "status": "active", "endpoint_url": "..." }
```

---

## 9. 当前代码对照

### 9.1 已有实现

| 组件 | 文件 | 状态 |
|------|------|------|
| Console UI (React) | `console/console-ui/` | ✅ Phase 1a + 2a-e 页面完成 |
| Console API (Mock) | `console/console-api/src/index.ts` | ✅ 18 个路由组，全 Mock 数据 |
| Mock 数据 | `console/console-api/src/fixtures.ts` | ✅ 模型、用量、计费等 |
| 前端路由 | `console/console-ui/src/App.tsx` | ✅ React Router v7 |
| API 客户端 | `console/console-ui/src/api/client.ts` | ✅ 无 token 拦截 |

### 9.2 待实现

| 组件 | 状态 | 优先级 |
|------|------|--------|
| Gateway + Request Router | ❌ 未开始 | P0 |
| Auth Service (真实) | ❌ 仅有 Mock | P0 |
| vLLM 推理引擎部署 | ❌ 未开始 | P0 |
| KAI Scheduler 集成 | ❌ 未开始 | P1 |
| K8s GPU 集群搭建 | ❌ 未开始 | P0 |
| PostgreSQL 数据层 | ❌ 仅有内存 Mock | P1 |
| Billing Service (真实) | ❌ 仅有 Mock | P1 |
| Prometheus + Grafana | ❌ 未开始 | P1 |
| AI Incident Diagnosis (真实 LLM) | ❌ 仅有 Mock | P2 |

### 9.3 Phase 1 上线最小路径

```
Phase 1 需要先搞定的：

1. K8s 集群 + vLLM 部署（让模型跑起来）
2. 一个简单的 Model Router（替代 Mock /v1/chat/completions）
3. 真实 Auth + API Key 管理（替代 Mock 登录）
4. 基础的 Usage Billing（替代 Mock 计费）
5. Console API 从 Mock 迁移到读真实 DB

Phase 2：
6. KAI Scheduler 集成
7. GPU 指标采集（DCGM → Prometheus）
8. Incident + AI Diagnosis
```

---

## 10. 决策记录

| 决策 | 选择 | 理由 | 日期 |
|------|------|------|------|
| API 网关 | Gateway (自研 Rust) | Kong 的 URL-based 路由模型与 AI 推理的 body-based 路由不匹配，自研 3-5 KLOC | 2026-07-11 |
| 推理引擎 | vLLM 基线 → Zealot 自研 | Phase 1 用开源快速上线，Phase 2 fork 优化，Phase 3 发布 Zealot | 2026-07-11 |
| 调度策略 | Policy Engine (Serverless/Batch/Reserved/Dedicated) | 一套 Runtime，四种策略配置。Phase 顺序：S+B → R → D | 2026-07-11 |
| GPU 调度 | KAI Scheduler | 集群资源调度（Pod → GPU），非推理请求调度 | 2026-07-10 |
| 推理引擎抽象 | Backend Runtime (gRPC I/F) | 统一接口，引擎可替换，多引擎共存 + A/B 测试 | 2026-07-11 |
| 时序数据 | ClickHouse (非 TimescaleDB) | 高基数 GPU 指标查询性能更好 | 2026-07-11 |
| 日志存储 | Loki + S3 | 低成本，无索引开销 | 2026-07-11 |
| Phase 1 模型 | 2 个 (Llama 8B + 70B) | 最小验证集 | 2026-07-10 |
