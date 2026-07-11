# ADR-000: Platform Object Model

**日期**: 2026-07-11  
**状态**: accepted  
**定位**: 所有 ADR 的上游基础。定义平台的领域对象，组件围绕对象工作，而非对象围绕组件存在。

---

## 原则

平台架构由**对象**定义，不由组件定义。组件（Gateway、Scheduler、KAI）是操作对象的执行者，不是架构的基准。新增组件不改对象模型，新增对象才改。

```
组件驱动（反模式）:         对象驱动（本 ADR）:

Gateway 做认证              InferenceRequest
  → Auth Service 验证           │
  → Rate Limiter 限流           ├── AuthPolicy   → Gateway 执行认证
  → Router 分发                 ├── RatePolicy   → Gateway 执行限流
                                ├── RoutePolicy  → Gateway 执行路由
Gateway 的组件描述               └── ExecutionPlan → Scheduler 执行
```

---

## 对象模型

### 第一层：组织与资源

```
Organization （租户顶层）
  │
  ├── Member （组织成员，含角色）
  ├── APIKey （Bearer token，绑定到 Organization）
  │
  └── Project （资源隔离单元）
        │
        ├── Deployment （模型部署定义）
        │     │
        │     ├── ModelRevision （模型版本 + 量化配置）
        │     ├── Policy （调度策略：Serverless/Batch/Reserved/Dedicated）
        │     ├── GPUPool （目标 GPU 资源池）
        │     └── Worker[] （推理工作负载实例）
        │
        └── Endpoint （对外暴露的推理入口）
              └── binds to → Deployment
```

### 第二层：推理执行

```
InferenceRequest （一次 API 调用）
  │
  ├── 入口：Gateway 接收，绑定 APIKey → Organization → Project
  ├── 路由：Project → Endpoint → Deployment → Policy
  │
  └── Policy 生成 → ExecutionPlan
        │
        ├── TargetPool: "serverless-llama70b"
        ├── Priority: Medium
        ├── BatchPolicy: Dynamic
        ├── Isolation: Shared
        ├── Deadline: 2s
        └── BillingClass: PerToken
              │
              ▼
        Scheduler 执行 ExecutionPlan
              │
              ├── 选择 Worker（通过 Runtime ABI）
              ├── 合批（Continuous Batching）
              ├── 生成 tokens
              └── 产出一组 InferenceSession
```

### 第三层：基础设施

```
GPUPool （GPU 资源池）
  │
  └── GPUNode （物理节点）
        │
        └── GPUCard （单张 GPU）
              ├── GPUModel: H100 / A100
              ├── MemoryTotal: 80GB / 40GB
              ├── Utilization
              ├── Temperature
              └── Processes

Worker （推理工作负载）
  │
  ├── 绑定到 GPUCard（通过 KAI Scheduler 分配）
  ├── 加载 ModelRevision（从 Artifact Store 拉取权重）
  ├── 实现 Runtime ABI
  └── 生命周期：Pending → Pulling → Loading → Ready → Draining → Stopped

Runtime ABI （引擎可替换契约）
  │
  ├── LoadModel / UnloadModel
  ├── Generate（双向流，含 cancel）
  ├── HealthCheck（结构化 GPU 状态）
  └── Metrics（实时指标流）
```

---

## 对象定义

### Organization

```
Organization {
  id: UUID
  name: string
  billing_email: string
  plan: "free" | "pro" | "enterprise"
  created_at: timestamp
}
```

### APIKey

```
APIKey {
  id: UUID
  organization_id: UUID
  prefix: string           // "ultr_..."
  hash: string             // SHA-256 of full key
  role: "admin" | "developer" | "readonly"
  model_allowlist: string[] | null
  quota: { monthly_token_limit: number | null }
  state: "active" | "revoked"
  last_used_at: timestamp
  created_at: timestamp
}
```

### Project

```
Project {
  id: UUID
  organization_id: UUID
  name: string
  description: string
  member_count: number
}
```

### Deployment

```
Deployment {
  id: UUID
  project_id: UUID
  name: string
  model_revision: ModelRevision
  policy: Policy
  gpu_pool_id: UUID
  replicas: { current: number, desired: number }
  state: DeploymentState    // 状态机
  created_at: timestamp
}

ModelRevision {
  model_id: string          // "llama-3.3-70b-instruct"
  quantization: "awq_int4" | "fp8" | "fp16"
  artifact_path: string     // S3 URI
  version: string
}
```

### Endpoint

```
Endpoint {
  id: UUID
  project_id: UUID
  deployment_id: UUID
  type: "serverless" | "batch" | "reserved" | "dedicated"
  url: string               // 对外 URL
  metrics: EndpointMetrics  // QPS, TTFT, TPOT, error_rate
  state: "creating" | "active" | "degraded" | "draining" | "stopped"
}
```

### Policy

```
Policy {
  type: "serverless" | "batch" | "reserved" | "dedicated"
  queue: "interactive" | "batch"
  priority: "lowest" | "medium" | "high" | "highest"
  batch_strategy: "dynamic" | "aggressive" | "small"
  isolation: "shared" | "soft" | "strict"
  billing_model: "per_token" | "per_tps" | "per_gpu_hour"
}
```

### InferenceRequest

```
InferenceRequest {
  id: UUID
  api_key_id: UUID          // 入口时绑定
  organization_id: UUID     // 入口时解析
  project_id: UUID          // 路由后绑定
  endpoint_id: UUID         // 路由后绑定
  model: string
  messages: Message[]
  stream: boolean
  created_at: timestamp
}
```

### ExecutionPlan

```
ExecutionPlan {
  request_id: UUID
  target_pool: string       // "serverless-llama70b"
  priority: Priority
  batch_policy: BatchPolicy
  isolation: Isolation
  deadline: duration
  billing_class: BillingClass
}
```

Policy Engine 从 Deployment.policy + InferenceRequest 生成 ExecutionPlan。Scheduler 只消费 ExecutionPlan，不感知业务策略。

### InferenceSession

```
InferenceSession {
  id: UUID
  request_id: UUID
  worker_id: UUID           // 执行该 session 的 Worker
  state: "queued" | "prefilling" | "decoding" | "completed" | "cancelled"
  usage: { prompt_tokens, completion_tokens }
  latency: { ttft_ms, tpot_ms, total_ms }
  cost: number
  started_at: timestamp
  completed_at: timestamp
}
```

### GPUPool / GPUNode / GPUCard

```
GPUPool {
  id: UUID
  name: string              // "us-east-1-prod"
  region: string
  gpu_model: "H100" | "A100"
  node_count: number
  healthy_node_count: number
}

GPUNode {
  id: UUID
  pool_id: UUID
  hostname: string
  gpu_model: string
  gpu_count: number
  state: "online" | "degraded" | "offline"
}

GPUCard {
  id: UUID
  node_id: UUID
  index: number
  utilization_pct: number
  memory_used_gb: number
  memory_total_gb: number
  temperature: number
  processes: Process[]
}
```

### Worker

```
Worker {
  id: UUID
  deployment_id: UUID
  gpu_card_ids: UUID[]      // 绑定的 GPU 卡
  model_revision: ModelRevision
  runtime_abi: RuntimeABI    // vLLM | Zealot | SGLang
  state: WorkerState        // 状态机
  metrics: WorkerMetrics
}

WorkerState:
  Pending → Pulling → Loading → Ready ⇄ Draining → Stopped
           (拉权重)   (加载到显存) (可接收请求)  (排空中)

WorkerMetrics {
  qps: number
  queue_depth: number
  gpu_util_pct: number
  memory_used_gb: number
}
```

---

## 状态机

### Deployment 状态

```
Pending ──→ Pulling ──→ Loading ──→ Ready ──→ Draining ──→ Stopped
                                  │
                                  └──→ Degraded（自动恢复或手动介入）
```

### Worker 状态

```
Pending ──→ Pulling ──→ Loading ──→ Ready ⇄ Draining ──→ Stopped
                                  │
                                  └──→ Failed（需人工介入）
```

### InferenceSession 状态

```
Queued ──→ Prefilling ──→ Decoding ──→ Completed
    │              │            │
    └──────────────┴────────────┴──→ Cancelled（任意阶段可取消）
```

---

## 组件映射

每个组件在对象模型中的角色：

| 组件 | 操作的对象 | 不做什么 |
|------|-----------|---------|
| **Gateway** | InferenceRequest（入口绑定 APIKey/Org） | 不做冷启动、不做 Deployment 管理 |
| **Console API** | Organization, Project, APIKey, Deployment, Endpoint（CRUD） | 不做推理路由 |
| **Policy Engine** | Deployment.policy → ExecutionPlan（策略→执行计划） | 不执行推理、不管理 GPU |
| **Scheduler** | ExecutionPlan → Worker（执行计划→选择 Worker） | 不感知 Serverless/Batch/Dedicated |
| **KAI Scheduler** | GPU Pool → GPU Card（Pod → GPU 分配） | 不做推理请求调度 |
| **Runtime ABI** | ModelRevision + GPU Card → tokens | 不感知计费、不感知策略 |
