# ADR-004: 集群资源调度器 — KAI Scheduler

**日期**: 2026-07-11  
**状态**: accepted  
**依赖**: ADR-000（Platform Object Model）、ADR-001（架构总览）、ADR-010（Backend Runtime）

> **对象定位**: KAI Scheduler 是 GPUPool 和 GPUCard 的编排器，不是独立的调度器。它回答"Worker 应该放到哪个 GPUCard"，不回答"请求应该发给哪个 Worker"。后者由 Scheduler 通过 ExecutionPlan 完成。

---

## Context

推理平台有三层调度，很多团队第一次做会把它们混在一起：

```
                    Client
                      │
                Request Router
                      │
        ┌────────────────────────┐
        │ Zealot Scheduler     │  ← 推理调度：请求合批、KV Cache、Prefill/Decode
        └────────────────────────┘
                      │
               Inference Worker
                      │
              Kubernetes Pod
                      │
        ┌────────────────────────┐
        │ KAI Scheduler          │  ← 集群调度：Pod → GPU Node
        └────────────────────────┘
                      │
                  GPU Node
```

| 调度器 | 层 | 职责 | 决策粒度 |
|--------|---|------|---------|
| **Request Router** (Gateway) | 入口 | 哪个请求发给哪个引擎 Pool | 毫秒级，每个 API 调用 |
| **Zealot Scheduler** (自研) | 推理引擎内部 | 请求合批、KV Cache 管理、Prefill/Decode 调度、Worker 选择 | 毫秒级，每个推理 step |
| **KAI Scheduler** | 基础设施 | 哪个 Pod 放到哪个 Node 的哪几张 GPU | 分钟级，部署/扩缩/回收时 |

Kubernetes 默认 scheduler 按 CPU/内存调度 Pod，不理解 GPU 拓扑。需要一个专门的集群资源调度器管理 GPU 分配和回收。

---

## Decision

选择 **KAI Scheduler**（NVIDIA 开源，原 Run:ai）作为**集群资源调度器**。

这是一个基础设施决策，不是推理引擎决策。KAI Scheduler 和 Zealot Scheduler 不是竞争关系，而是上下两层、互相配合。

---

## KAI Scheduler 的职责边界

### ✅ 做的（集群资源调度）

| 能力 | 说明 |
|------|------|
| **GPU Bin Packing** | 尽量填满一张卡再分配下一张，减少 GPU 碎片 |
| **GPU Sharing** | 小模型（7B/13B/Embedding）共享一张卡 |
| **MIG 分配** | H100 切分为 7 Slice，不同模型不同 Slice |
| **Quota** | Priority / Fair Share / Quota，适合多团队共享集群 |
| **Preemption** | 高优 Pod 抢占低优 Pod 的 GPU |
| **Gang Scheduling** | 大模型需要 2/4/8 张 GPU 同时分配 |

### ❌ 不做的（推理调度，归 Zealot Scheduler）

| 不做 | 说明 |
|------|------|
| Continuous Batching | 如何将 1000 个请求组成一个 Batch |
| KV Cache 管理 | Block 分配、前缀复用 |
| Prefill/Decode 调度 | Chunked prefill、Decode 优先级 |
| Token 级调度 | Speculative decoding、Draft model 协调 |
| 请求级负载均衡 | 哪个请求发哪个 Worker |

**一句话**：KAI Scheduler 决定「Pod 去哪张 GPU」。Zealot Scheduler 决定「哪个请求在哪个 Worker、以什么 Batch、什么时候执行」。

---

## 架构中的位置

```
              API
               │
        Gateway          ← 请求路由
               │
     Zealot Scheduler        ← 自研（核心竞争力）
     (Zealot Engine 内部)
               │
      Backend Runtime           ← ADR-010
               │
        Kubernetes              ← 容器编排
               │
      KAI Scheduler             ← GPU 资源调度（本文）
               │
        GPU Cluster             ← H100/A100 Nodes
               │
     Rust Runtime / vLLM        ← 执行引擎
```

---

## Rationale

| 维度 | KAI Scheduler | Volcano | K8s DRA | 自研 |
|------|--------------|---------|---------|------|
| Bin Packing (GPU) | ✅ 专为 GPU 拓扑 | ⚠️ 通用 binpack | ❌ | ❌ |
| GPU Sharing | ✅ MIG + Time-slicing | ❌ | ❌ | ❌ |
| Fair Share / Quota | ✅ 层级配额 | ✅ Queue 模型 | ⚠️ | ❌ |
| Gang Scheduling | ✅ | ✅ | ⚠️ | ❌ |
| NVIDIA 生态 | ✅ GPU Operator + DCGM | ⚠️ | ⚠️ | ❌ |

**选择 KAI Scheduler 的关键原因：**

1. **NVIDIA 官方生态**：与 GPU Operator、DCGM 深度集成，不需要自己写 GPU 发现和监控
2. **GPU Bin Packing**：专门针对 GPU 拓扑（NVLink 亲和性），减少碎片
3. **GPU Sharing**：小模型多实例共享一张卡，大幅提升利用率
4. **层级配额**：Organization → Project 的 GPU 配额天然映射
5. **长期维护**：如果有 32 台 GPU + 多团队，KAI 可以自动管理 Bin Packing、Failover、Quota、Multi-tenant，不需要自己维护 GPU Inventory

**为什么不是 Volcano**：面向 HPC/批处理的通用调度，GPU 专用能力弱于 KAI。

**为什么不是 K8s DRA**：仍为 alpha/beta，GPU 拓扑感知不足。

---

## 与其他组件的交互

```
Control Plane (Console API)
    │ 创建 Endpoint
    ▼
Backend Runtime
    │ LoadModel(gpu_count=2, gpu_type="H100")
    ▼
KAI Scheduler
    │ 1. 查找 H100 空闲 GPU
    │ 2. Gang check + Bin pack
    │ 3. 创建 K8s Pod，绑定 GPU
    ▼
Backend Runtime
    │ 启动推理进程 → 引擎自行做 Inference Scheduling
    ▼
Gateway
    │ 路由表更新
```

**关键**：KAI Scheduler 只在部署/扩缩/回收时被调用，不是每个推理请求都过它。推理请求的调度循环在 Zealot Scheduler 内部，与 KAI 完全解耦。

---

## Consequences

**正面：**
- 成熟的基础设施组件，GPU 碎片率从 30-40% 降至 10-15%
- 与 K8s + KServe 形成标准部署栈
- 不需要自己写 GPU Inventory 管理系统

**负面：**
- KAI 和 K8s 默认 scheduler 共存，需用 taint/toleration 隔离
- NVIDIA 可能关闭开源版本（商业风险）
- 引入额外的运维复杂度

**待跟进：**
- Quota tree 设计（Organization → Project → GPU quota）
- Zealot Scheduler 的详细设计（请求合批、KV Cache、Prefill/Decode 调度策略）
- 回退方案（KAI 闭源 → Volcano）

---

## 评价

**如果把 KAI Scheduler 放在基础设施层，这是一个成熟且合理的决策。**

但不要期望它替代推理引擎中的调度逻辑。真正决定推理平台性能和成本的，仍然是自研的 Zealot Scheduler——请求合批、KV Cache 生命周期、Prefill/Decode 拆分、Worker 选择和负载均衡。
