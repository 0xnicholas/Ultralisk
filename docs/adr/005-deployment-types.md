# ADR-005: 推理调度策略与 Policy Engine

**日期**: 2026-07-11  
**状态**: accepted  
**依赖**: ADR-000（Platform Object Model）、ADR-001（架构总览）、ADR-004（KAI Scheduler）、ADR-010（Backend Runtime）

> **对象定位**: Policy Engine 是 Deployment.policy → ExecutionPlan 的转换器。Serverless/Batch/Reserved/Dedicated 不是四个产品，而是 Policy 对象的四种配置。Scheduler 只消费 ExecutionPlan，不感知业务策略。

---

## Context

AI 推理平台的服务形态看似有三种——Serverless（按量）、Batch（异步）、Dedicated（独享）——但它们的**底层 Runtime 完全相同**。区别仅在于：请求如何排队、如何合批、如何分配 GPU 资源、如何计费。

如果为每种形态维护独立 Runtime，将导致三倍的开发、测试、运维成本。正确的做法是：一个 Runtime，多种策略。

---

## Decision

采用 **Policy Engine（策略引擎）** 架构。所有请求进入同一推理平台，策略引擎根据部署类型决定 Queue、Priority、Batch Strategy、Resource Isolation、Billing 五个维度。

```
                           API Request
                                │
                          Gateway
                                │
                    ┌───────────▼───────────┐
                    │    Policy Engine      │  ← 本文核心
                    │                       │
                    │  Queue       Priority │
                    │  Batch       Isolation│
                    │  Billing     SLA      │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Zealot Scheduler   │  ← 同一套
                    │   (合批、KV Cache、    │
                    │    Prefill/Decode)    │
                    └───────────┬───────────┘
                                │
                         GPU Workers
```

**四种策略**：

| 策略 | Phase | 本质 | Queue | Priority | Batch | Isolation | 计费 |
|------|-------|------|-------|----------|-------|-----------|------|
| **Serverless** | 1 | 多租户共享 GPU | 交互队列 | 中 | Dynamic | 无 | 按 token |
| **Batch** | 1 | 延迟不敏感，追求吞吐 | 批处理队列 | 最低 | Aggressive（60s 攒批） | 无 | 按 token |
| **Reserved** | 2 | 保证容量，共享 GPU | 交互队列 | 高 | Dynamic | 软隔离 | 按 TPS / GPU 时 |
| **Dedicated** | 3 | 单租户，独享资源 | 交互队列 | 最高 | Small（低延迟优先） | 硬隔离 | 按 GPU 时 |

---

## Rationale

### 为什么是一个 Policy Engine 而非三个产品

三个模式本质上只是五个维度的不同配置：

```
Serverless:   Queue=interactive  Priority=medium  Batch=dynamic     Isolation=none
Batch:        Queue=batch        Priority=lowest  Batch=aggressive   Isolation=none
Reserved:     Queue=interactive  Priority=high    Batch=dynamic     Isolation=soft
Dedicated:    Queue=interactive  Priority=highest Batch=small       Isolation=strict
```

Runtime 永远只有一套。添加新策略（如 Spot、Region Affinity、Cost Optimized）只是新增一行配置，不需要改任何引擎代码。

### Serverless 优先

最容易交付和获客。Phase 1 核心指标不是 SLA，是 **GPU 利用率**——利用率 90%+ 才开始赚钱。

**冷启动**（Serverless 独有问题）：GPU 模型加载需要 2-5 分钟。策略：
- 热门模型常驻 GPU（Llama 8B 成本低，永不卸载）
- 冷门模型走冷启动路径（Gateway 排队 + KAI 分配 GPU + 加载模型）
- 提供预热 API：`POST /v1/models/{id}/warmup`

### Batch 不是"打折 Serverless"，是独立的利润引擎

Embedding、Document Parsing、RAG Build、Fine-tuning Data、Evaluation——这些场景不需要 500ms 响应。Batch 可以攒 30 秒组成超大 Batch，GPU 利用率远超交互式推理。

**Phase 1 定价**：Phase 1 不做 50% 折扣。GPU 规模小时不存在"闲置 GPU"，每张卡都需要产生收入。Batch 定价和 Serverless 相同，只是客户体验不同（异步提交 + 结果回调）。折扣留到 Phase 3（100+ GPU、夜间低谷）再评估。

**独立队列**：Batch 和 Serverless 使用不同的 Queue。Zealot Scheduler 交互队列空闲时优先消费批处理队列。

### Reserved 插入 Phase 2

很多企业要的不是独享 GPU，是**容量保证**（"我每月需要 20 TPS"）。Reserved 介于 Serverless 和 Dedicated 之间——GPU 仍然共享，但通过 Scheduler 的 priority 机制保证容量。

比 Dedicated 利润更高（因为 GPU 依然共享，多个 Reserved 客户叠加在同一批 GPU 上）。

### Dedicated 最后

客户少、运维成本最高、利润不如 Reserved。Dedicated 的价值在于支持 LoRA、私有模型、自研 Runtime——不是"一台 GPU"，而是"一个独享 Resource Pool"。等有 3+ 客户明确要求时再做。

---

## 策略对比

```
维度       Serverless     Batch         Reserved       Dedicated
───────────────────────────────────────────────────────────────
Queue       交互队列       批处理队列     交互队列        交互队列
Priority    中             最低           高             最高
Batch       Dynamic        Aggressive*    Dynamic        Small
            (2-5ms 窗口)  (60s 攒批)     (2-5ms)        (固定)
Isolation   无             无            软隔离         硬隔离
                                       (KV cache      (独享 GPU
                                        分区)          Pool)
SLA         无             无            TPS 保证       99.5%
Billing     per token      per token     per TPS       per GPU-hr
                                       / GPU-hr

* Aggressive: 故意等 60 秒攒大 Batch，单个请求延迟高但 GPU 利用率接近 100%
```

---

## Policy Engine 设计

Policy Engine 在 Phase 2 内嵌在 Zealot Scheduler 中，作为调度策略配置层。Phase 1 由于后端是 vLLM（不认识策略），策略由 **Gateway 在入口侧落地**——Serverless 立即转发，Batch 在 Gateway 攒批后一次性提交。详见 ADR-010 §SchedulingHint。

> **Phase 1 物理隔离要求**：vLLM 不感知 priority。如果 Batch 和 Serverless 共享同一个 vLLM Worker Pool，Batch 请求进入 vLLM 后和 Serverless 请求平等竞争——"最低优先级"只是 Gateway 侧的打包时机差异，无执行层约束力。因此 Phase 1 **必须将 Batch 和 Serverless 路由到不同的 GPU Pool**（不同的 model_id 路由条目 → 不同的 vLLM Pod 组）。隔离做在物理层，不在调度层。

```rust
// Zealot Scheduler 内部（Phase 2 起生效）
struct SchedulingPolicy {
    queue: QueueType,        // Interactive | Batch
    priority: Priority,      // Lowest | Low | Medium | High | Highest
    batch_strategy: BatchStrategy,  // Dynamic | Aggressive | Small
    isolation: Isolation,    // None | Soft | Strict
    billing: BillingModel,   // PerToken | PerTPS | PerGpuHour
}

// 策略注册（编译期）
const POLICIES: HashMap<DeploymentType, SchedulingPolicy> = {
    Serverless → SchedulingPolicy { queue: Interactive, priority: Medium, ... }
    Batch      → SchedulingPolicy { queue: Batch,       priority: Lowest, ... }
    Reserved   → SchedulingPolicy { queue: Interactive, priority: High,   ... }
    Dedicated  → SchedulingPolicy { queue: Interactive, priority: Highest,... }
};
```

Gateway 在 `route` middleware 里查 DeploymentType → 注入 `X-Policy: serverless` header → Zealot Scheduler 读 header 应用对应策略。

---

## Consequences

**正面：**
- 一套 Runtime 服务所有部署类型，维护成本不随策略数量增长
- 新增策略（Spot、Region Affinity）只需配置，不改引擎
- Phase 1 只做 Serverless + Batch，技术复杂度最低
- Reserved 作为 Phase 2 主打产品，企业友好且利润高

**负面：**
- Policy Engine 抽象层需要额外设计（Zealot Scheduler 内部，不影响部署复杂度）
- Batch 60s Aggressive 在 Phase 1 没有折扣的情况下定价和 Serverless 一致，客户可能不理解"为什么等更久还一样贵"——需要文档说明

**待跟进：**
- 策略注册机制的实现方案（编译期 vs 运行时配置）
- Reserved 的容量保证具体算法（Scheduler 如何保证 TPS 配额）
- Batch Queue 的空闲消费策略（交互队列多久空闲才能开始消费 Batch）

### 自动扩缩容触发策略

KAI Scheduler 负责 Pod→GPU 绑定，但"什么时候该多起一个 Worker"是 Policy Engine + Scheduler 的联合决策。触发条件：

| 触发条件 | 指标来源 | 动作 |
|---------|---------|------|
| queue_depth > N（N=当前 Worker 数 × 最大并发数） | Scheduler | Scale up：KAI 分配新 GPU → 创建新 Worker |
| queue_depth = 0 持续 T 秒 | Scheduler | Scale down：Drain Worker → 回收 GPU 回 Pool |
| GPU utilization < 30% 持续 5min | DCGM → Prometheus | Scale down（保守，避免颠簸） |
| Reserved 容量不足（TPS 跌破保证值） | Scheduler | Scale up，即使 GPU 利用率未满 |

Phase 1：Serverless 用 queue_depth 作为唯一扩缩容指标。Batch 固定 Worker 数，不自动扩缩容（Batch Pool 独立，不和 Serverless 共享 GPU）。Dedicated/Reserved 的精细化策略推迟到 Phase 2。

### Dedicated 隔离边界（Phase 3）

ADR-005 定义 Dedicated 为"硬隔离"（isolation=strict）。具体实现推迟到 Phase 3（首个企业 Dedicated 客户上线前），但原则先声明：

- **默认**：K8s Namespace 级隔离 + GPU Node 独享。一个 Dedicated 租户独享至少一个完整 GPU Node（不和其他租户共享 GPU 卡），消除 GPU side-channel 顾虑。
- **可选（高安全需求）**：物理机级隔离。整个 GPU Node 所在的物理机不部署其他租户的任何 Pod。成本更高，但满足金融/医疗合规要求。

### 模型版本灰度与回滚（Phase 2）

Deployment 对象（ADR-000）的状态机定义了 Worker 生命周期，但 ModelRevision 升级（换模型版本）的灰度策略未覆盖：

```
ModelRevision 升级流程:
  1. 新版本创建 Deployment (revision=v2)，初始 replicas=0
  2. 路由表权重调整：v1=90, v2=10 → 10% 流量验证新版本
  3. 观察 v2 的 error_rate, P99 latency (Prometheus)
  4. 正常 → v1=0, v2=100 → 完成
  5. 异常 → v2 weight=0 → 秒级回滚
```

此流程复用 ADR-010 路由表的 weight 字段（灰度迁移场景）。Phase 1 所有模型单版本，Phase 2 启用。
