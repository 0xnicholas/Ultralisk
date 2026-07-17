# ADR-010: Backend Runtime — 推理引擎可替换抽象

**日期**: 2026-07-11  
**状态**: accepted  
**依赖**: ADR-000（Platform Object Model）、ADR-001（架构总览）、ADR-003（引擎选型）、ADR-004（KAI Scheduler）、ADR-009（Zealot 语言栈）

> **对象定位**: Runtime ABI 是 Worker 对象的可替换契约。Backend Runtime 是 ABI 的具体实现——vLLM Backend 是适配器（gRPC → HTTP），Zealot Backend 是内嵌（native trait）。Gateway 和 Scheduler 只依赖 ABI，不感知具体 Backend。

---

## Context

Data Plane 当前的设计是 Gateway 和 Control Plane 直接耦合到具体推理引擎实现。这意味着换引擎、加引擎、升级引擎——每一层都要改。

但我们的引擎策略是**可替换，一个切换一个**：
- Phase 1：vLLM（通用推理基线）
- Phase 2：vLLM + Zealot A/B 灰度，Zealot 替代 vLLM
- 备选：SGLang（结构化生成场景补充，不在当前路线）

如果 Gateway 需要知道"这个模型用 vLLM 还是 Zealot"并分别写对接逻辑，复杂度随引擎数量线性增长。需要引入一个抽象层，让具体实现成为可替换组件。

---

## Decision

定义 **Runtime Interface**（标准 gRPC 协议）作为推理能力的统一契约，每个具体引擎实现为一个 **Backend Runtime**。

```
                         ┌─────────────────┐
                         │ Gateway  │
                         │  + Control Plane│
                         └────────┬────────┘
                   │ gRPC (唯一协议)
                    ┌────────▼────────┐
                    │ Runtime I/F     │  ← 逻辑边界，proto 定义
                    └──┬──────────┬───┘
                       │          │
               ┌───────▼┐     ┌──▼──────┐
               │ vLLM   │     │ Zealot  │  ← Backend Runtimes
               │Backend │     │Backend  │     vLLM: 适配器 gRPC→HTTP
               └───┬───┘     └──┬──────┘     Zealot: native trait
                   │            │
               vLLM Pod    Zealot Pod
                   │
           (SGLang Backend — proto 已预留，按需接入)
```

**核心原则**：
- Gateway 和 Control Plane **只依赖 Runtime Interface**，不感知任何具体引擎
- 每个 Backend Runtime 是 Protocol 的一个实现——可以是对外引擎的适配器（vLLM），也可以是内嵌调用（Zealot）
- 新增引擎 = 新增 Backend 实现 + 配置注册，不修改 Gateway/Control Plane 代码

---

## Design

### Runtime Interface

```protobuf
// runtime/v1/runtime.proto

service InferenceRuntime {
  // 模型生命周期
  rpc LoadModel(LoadModelRequest) returns (LoadModelResponse);
  rpc UnloadModel(UnloadModelRequest) returns (UnloadModelResponse);
  rpc ListModels(ListModelsRequest) returns (ListModelsResponse);

  // 推理执行（双向流）
  rpc Infer(stream InferRequest) returns (stream InferResponse);

  // 批处理
  rpc SubmitBatch(BatchRequest) returns (BatchResponse);
  rpc GetBatchStatus(BatchStatusRequest) returns (BatchStatusResponse);

  // 健康检查
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
  rpc StreamMetrics(google.protobuf.Empty) returns (stream MetricsSnapshot);
}

// ── 策略透传字段（API 层面，非调度层面）──

message InferRequest {
  // ... 原有字段 (model, messages, params, stream_start/cancel 等)

  // 来自 Policy Engine 的调度提示。Backend 可以忽略（Phase 1 vLLM 忽略），
  // 但 Phase 2 Zealot Scheduler 会完整消费这些字段。
  SchedulingHint scheduling_hint = 10;
}

message SchedulingHint {
  Priority priority = 1;          // LOWEST=0, MEDIUM=1, HIGH=2, HIGHEST=3
  uint32 deadline_ms = 2;         // 如果 > 0，超过此时间未开始执行可降级或拒绝
  BatchAffinity batch = 3;        // 是否允许合批等待
}

enum BatchAffinity {
  BATCH_AFFINITY_UNSPECIFIED = 0;
  BATCH_AFFINITY_INTERACTIVE = 1; // 立即执行，不做攒批等待（Serverless/Reserved/Dedicated）
  BATCH_AFFINITY_AGGRESSIVE = 2;  // 允许 60s 攒批窗口（Batch）
}
```

### 关键接口设计

**Infer —— 双向流**

不是 request→response 的 unary 调用，而是一条持续的双向流：

```
Gateway                           Backend Runtime
   │                                    │
   │── InferRequest ───────────────────>│  model, messages, params
   │   (stream_start)                   │
   │── InferRequest ───────────────────>│  追加消息（多轮对话）
   │   (message_append)                 │
   │── InferRequest ───────────────────>│  用户取消
   │   (cancel)                         │
   │                                    │
   │<── InferResponse (delta) ──────────│  "Hello"
   │<── InferResponse (delta) ──────────│  " world"
   │<── InferResponse (final) ──────────│  usage + finish_reason
   │<── [stream closed]                 │
                                       │
Cancel 路径：                          │
   │── InferRequest (cancel) ──────────>│  用户取消
   │<── InferResponse (final) ──────────│  仍需返回 usage（已生成 token 照常计费）
   │<── [stream closed]                 │
```

这个设计映射到 SSE 透传：Gateway 收到 gRPC stream → 转为 SSE event → 发给客户端。Cancel 语义原生支持——不需要 Gateway 去杀 HTTP 连接。

**SchedulingHint 的 Phase 1 vs Phase 2**

这是 Policy Engine（ADR-005）和 Runtime Interface 之间的关键集成点。

```
Phase 1（vLLM Backend）：策略由 Gateway 在入口侧落地，Backend 忽略 SchedulingHint

  Gateway                           vLLM Backend (sidecar)
    │                                    │
    │ Policy 判断:                        │
    │  Serverless → 立刻转发              │
    │  Batch → 攒批 60s 后一次性提交       │
    │                                    │
    │ InferRequest{scheduling_hint: ────>│  ← vLLM 忽略 hint
    │   batch=AFFINITY_AGGRESSIVE}       │     只关心 messages/params
    │                                    │
    │                                    │ 转发到 vLLM HTTP
    │<── InferResponse (stream) ─────────│
    
Phase 2（Zealot Backend）：Backend 内嵌 Zealot Scheduler，完整消费 SchedulingHint

  Gateway                           Zealot Backend (native)
    │                                    │
    │ InferRequest{scheduling_hint: ────>│  Zealot Scheduler 读取
    │   priority=HIGHEST,                │  → 插队到队列头
    │   deadline_ms=2000,                │  → 2s 超时触发降级
    │   batch=AFFINITY_INTERACTIVE}      │  → 不做攒批，立刻执行
    │                                    │
    │<── InferResponse (stream) ─────────│
```

Phase 1 的简化策略：
- vLLM 的 continuous batching 是固定的（vLLM 内部的默认调度），不支持外部策略控制
- Serverless 和 Batch 的区别由 **Gateway 侧的行为** 体现：Serverless 立即转发，Batch 在 Gateway 攒够 60s 后一次性发送
- vLLM Backend 收到 SchedulingHint 后直接忽略——只把 messages/params 转成 OpenAI HTTP 调用
- **物理隔离**：Batch 和 Serverless 必须路由到不同的 GPU Pool，否则 vLLM 内部平等对待两者，优先级形同虚设
- 这不是"策略丢失"，是 Phase 1 有意的简化：vLLM 不认识策略，Gateway 在入口层做了区分，KAI Scheduler 在硬件层做了隔离

**HealthCheck —— 结构化状态**

```protobuf
message HealthCheckResponse {
  Status status = 1;           // HEALTHY / DEGRADED / UNHEALTHY
  uint32 queue_depth = 2;      // 等待中的请求数
  float gpu_util_pct = 3;      // GPU 利用率
  float memory_used_gb = 4;    // 显存使用量
  uint32 active_requests = 5;  // 正在处理的请求数
}
```

Gateway 的三层健康模型（active/passive/circuit）直接消费这个结构化状态。不再猜"HTTP 200 到底健不健康"。

**LoadModel —— 与 KAI Scheduler 协作**

```protobuf
message LoadModelRequest {
  string model_id = 1;
  Quantization quantization = 2;  // AWQ_INT4 / FP8 / FP16
  uint32 gpu_count = 3;           // 需要几张 GPU
  string gpu_type = 4;            // H100 / A100
  map<string, string> labels = 5; // 调度标签（传给 KAI Scheduler）
}
```

Control Plane 创建 Endpoint 时调用 LoadModel。Backend 内部与 KAI Scheduler 交互申请 GPU 资源，再启动推理进程。Control Plane 不需要知道 KAI Scheduler 的存在——它只是说"我需要跑这个模型"。

### InferParams 与采样架构（2026-07 更新）

InferParams 在 Phase 2 中扩展了完整的采样参数字段：

```protobuf
message InferParams {
  uint32 max_tokens = 1;
  float temperature = 2;
  float top_p = 3;
  repeated string stop = 4;
  string json_schema = 5;      // Constrained Decode
  uint32 top_k = 6;             // ← Phase 2 新增
  float repetition_penalty = 7; // ← Phase 2 新增
  float frequency_penalty = 8;  // ← Phase 2 新增
  float presence_penalty = 9;   // ← Phase 2 新增
  uint64 seed = 10;             // ← Phase 2 新增 (0 = engine-default RNG)
}
```

**采样在哪个层执行**：
- vLLM Backend：采样在 vLLM 内部（Python/torch），InferParams 透传给 vLLM HTTP API
- Zealot Backend：采样在 Rust Engine 层执行。PyModelRunner 返回 raw logits（`StepOut.logits`），Engine 调用 `Sampler::sample()` 完成 temperature/top-k/top-p/penalties/softmax/sampling 全链路。Python 不进 decode loop 的采样热路径

**Tokenizer/Detokenizer 决策**：
- Encoding（text→ids）：继续使用 Python HuggingFace tokenizer（PyModelRunner.tokenize_chat），在请求入口处一次性完成
- Decoding（ids→text）：实现轻量级 Rust Tokenizer（`tokenizer.rs`），从 tokenizer.json 加载词汇表做 byte-level BPE 解码。Engine 采样后增量解码，消除 Python detokenizer 的 FFI 开销

### Backend Runtime 实现方式

**vLLM Backend（适配器模式）**

vLLM 原生 HTTP/OpenAI 协议，不做 gRPC。Backend 是 gRPC → HTTP 的协议转换 sidecar：

```
┌─────────────────────────────────────────────┐
│  vLLM Backend (Rust sidecar)               │
│  ┌──────────────────────────────────────┐  │
│  │  gRPC Server (Runtime Interface)     │  │
│  └──────────────┬───────────────────────┘  │
│                 │                           │
│  ┌──────────────▼───────────────────────┐  │
│  │  Adapter: gRPC ↔ OpenAI HTTP         │  │
│  │  • LoadModel → POST /v1/load         │  │
│  │  • Infer → POST /v1/chat/completions │  │
│  │  • HealthCheck → GET /health          │  │
│  └──────────────┬───────────────────────┘  │
│                 │ HTTP (localhost)          │
│  ┌──────────────▼───────────────────────┐  │
│  │  vLLM Process (Python)               │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

**Zealot Backend（内嵌模式）**

Zealot 已经是 Rust，直接实现 Runtime Interface 作为 native trait：

```rust
// Zealot Backend — native implementation, no adapter needed
#[tonic::async_trait]
impl InferenceRuntime for ZealotBackend {
    async fn load_model(&self, req: LoadModelRequest) -> Result<LoadModelResponse> {
        self.scheduler.allocate_gpu(req.gpu_count, req.gpu_type).await?;
        self.engine.load_weights(req.model_id, req.quantization).await
    }

    async fn infer(&self, stream: Streaming<InferRequest>) -> Result<Streaming<InferResponse>> {
        // direct native call — no HTTP hop, no serialization overhead
    }
}
```

### 引擎注册与发现

Control Plane 维护路由表。每个模型可以路由到一个或多个 Backend，带权重：

```
路由表 (PostgreSQL):
┌──────────────────────────┬────────────┬────────┬──────────────────┬─────────┐
│ model_id                 │ runtime_id │ weight │ endpoint         │ status  │
├──────────────────────────┼────────────┼────────┼──────────────────┼─────────┤
│ llama-3.3-70b-instruct   │ vllm-001   │   80   │ 10.0.0.5:9091    │ ready   │
│ llama-3.3-70b-instruct   │ zealot-001 │   20   │ 10.0.0.6:9091    │ ready   │  ← A/B 测试：20% 流量走 Zealot
│ llama-3.1-8b-instruct    │ vllm-002   │  100   │ 10.0.0.5:9092    │ ready   │
│ deepseek-v4-pro          │ zealot-002 │  100   │ 10.0.0.6:9092    │ ready   │
│ qwen-2.5-72b             │ sglang-001 │  100   │ 10.0.0.7:9091    │ loading │
└──────────────────────────┴────────────┴────────┴──────────────────┴─────────┘
```

Gateway 路由解析：`model_id → [(runtime_id, weight, endpoint)]`，按权重随机选择。权重为 0 的条目不参与路由（可用于灰度暂停）。

**权重字段的用途**：

| 场景 | 配置 |
|------|------|
| 正常生产 | 单条目，weight=100 |
| A/B 测试 | 两条目，weight=80/20，流量按比例分流 |
| 灰度迁移 | vLLM 100→80→50→0，Zealot 0→20→50→100 |
| 紧急回滚 | 新引擎 weight → 0（立即切回旧引擎） |

Phase 1 所有模型只有单 Backend（weight=100），A/B 能力在 schema 层已预留，Phase 2 多引擎共存时启用。

---

## Rationale

**为什么用 gRPC 而非 REST：**
- 双向流（Infer）在 REST/SSE 上需要把 Gateway 的逻辑卷入 HTTP 语义
- gRPC 的流控制、取消传播、截止时间是原生语义
- Protobuf 强类型，运行时不需要猜 JSON schema
- 与 K8s 生态一致（KServe 也是 gRPC）

**为什么 Backend 和引擎同 Pod：**
- 推理请求延迟敏感，Backend 和引擎之间的网络跳转应最小化
- Pod 内 localhost 通信 < 100μs，跨 Pod 额外 1-3ms
- KAI Scheduler 以 Pod 为单位调度 GPU，同 Pod 天然绑定

**为什么不直接把 Runtime Interface 做到引擎里面：**
- vLLM（Python）做 gRPC server 是可行的，但我们的 Zealot（Rust）应该"原生实现"而非"套一层"
- 适配器模式允许我们接入我们不想修改的外部引擎（SGLang）
- 内嵌模式允许我们自研引擎获得零开销调用
- 同一个 Interface 包容两种实现策略

---

## Consequences

**正面：**
- 引擎变更对 Gateway/Control Plane 透明——换引擎不需要改路由层或管理层
- 多引擎共存——不同模型用不同引擎，Gateway 不感知
- A/B 测试——同一个模型同时部署 vLLM Backend 和 Zealot Backend，Gateway 按比例分流
- 私有化可插拔——客户自研引擎只需实现 Runtime Interface 即可接入 Ultralisk 平台
- 升级零停机——新增 Zealot Backend → 流量逐步切换 → 下掉旧 Backend

**负面：**
- Runtime Interface 需要覆盖所有引擎的能力交集，过度抽象可能限制各引擎的优势特性
- gRPC 的流式调用比 HTTP 的直接 SSE 透传多一层转换（Gateway 做 gRPC stream → SSE event）
- vLLM Backend 的适配器增加了一个 sidecar 进程开销

**待跟进：**
- Runtime Interface 的版本管理策略——proto 变更时如何保证向后兼容
- Backend 的扩展字段设计——允许各引擎暴露引擎特有配置而不破坏 Interface
