# ADR-001: 云原生推理平台架构

**日期**: 2026-07-11  
**状态**: accepted  
**依赖**: ADR-000（Platform Object Model）  
**决策者**: Ultralisk 架构组

> 本 ADR 定义对象如何跨越 Gateway/Control Plane/Data Plane 流动。具体对象定义见 ADR-000。

---

## Context

Ultralisk 是一个 AI 推理云平台，同时服务三类用户：AI 开发者（调 API）、ML/Platform 团队（管 GPU）、企业管理员（合规审计）。系统需要同时承载**实时推理流量**和**管理控制流量**，且两者有完全不同的性能、安全、可用性要求。

核心挑战：
- 推理流量要求低延迟（P99 < 2s），高吞吐，流式 SSE 响应
- 管理流量要求强一致性，事务性，可审计
- 两者不能互相影响（计费系统挂了不能阻止推理继续）
- 推理路由依赖请求 body（`model` 字段），与传统 REST API 网关的 URL-based 模型不兼容

---

## Decision

采用 **云原生推理平台架构**：控制平面负责资源和运维，数据平面负责高性能推理，底层 Runtime 可随技术演进不断替换和优化。

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
    │  │  Gateway (Rust)                                   │  │
    │  │  auth → ratelimit → route → proxy → observe              │  │
    │  └──────┬──────────────────────┬────────────────────────────┘  │
    └─────────┼──────────────────────┼───────────────────────────────┘
              │                      │
   管理流量   │                      │ 推理流量
   /v1/admin/*│                      │ /v1/chat/*
              ▼                      ▼
    ┌──────────────────┐    ┌──────────────────────────────┐
    │  CONTROL PLANE   │    │        DATA PLANE            │
    │                  │    │                              │
    │ ┌──────────────┐ │    │  ┌───────────────────────┐  │
    │ │ Console API  │ │    │  │  Runtime Interface    │  │  gRPC (ADR-010)
    │ │ (TypeScript) │ │    │  │  (逻辑边界)            │  │
    │ │ CRUD │ 计费  │ │    │  └───┬───────┬───────┬───┘  │
    │ └──────────────┘ │    │      │       │       │      │
    │ ┌──────────────┐ │    │  ┌───▼──┐ ┌──▼──┐ ┌──▼───┐ │
    │ │ Auth Service │◄─┼────┼──│ vLLM │ │Zealot│ │SGLang│ │ Backend
    │ │ (Rust)       │ │    │  │Backend│ │Backend│ │Backend│ │ Runtimes
    │ └──────────────┘ │    │  └───┬──┘ └──┬──┘ └──┬───┘ │
    └──────────────────┘    │      │       │       │      │
                            │  ┌───▼───────▼───────▼───┐  │
                            │  │   KAI Scheduler      │  │ GPU 调度
                            │  │   (GPU 资源编排)      │  │
                            │  └──────────┬───────────┘  │
                            │             │              │
                            │  ┌──────────▼───────────┐  │
                            │  │  K8s + GPU 集群      │  │ 物理
                            │  │  H100 / A100 Nodes   │  │
                            │  └──────────────────────┘  │
                            └──────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────┐
    │                    OBSERVABILITY                             │
    │  Prometheus (GPU 指标) │ Loki (日志) │ Grafana │ AlertMgr   │
    └──────────────────────────────────────────────────────────────┘
```

**流量分离**：
- 管理流量 `/v1/admin/*` → Gateway → Console API
- 推理流量 `/v1/chat/*` → Gateway → Runtime Interface → Backend Runtime → 引擎 Pod
- Gateway 侧调 Auth Service 验证 API Key（Redis 缓存结果）

| 层 | 组件 | 技术栈 | 职责 |
|---|------|--------|------|
| **Gateway** | Gateway | Rust | 认证（调 Auth Service）、token 限流、body-based 模型路由、SSE 透传与计费侧录、冷启动排队 |
| **Control Plane** | Console API + Auth Service | TypeScript + Rust | Console API：管理编排、CRUD、计费、审计。Auth Service：API Key 验证（Gateway 侧调，Redis 缓存） |
| **Data Plane** | Runtime I/F → Backend Runtimes → KAI Scheduler → K8s/GPU | Rust + CUDA + Python | Runtime I/F 定义契约，Backend Runtime 实现引擎接入，KAI Scheduler 编排 GPU，K8s 管理物理资源 |
| **跨层** | Observability | Prometheus + Loki + Grafana | GPU 指标、日志聚合、告警、Grafana 面板（覆盖三层） |

---

## Rationale

**为什么不用单体：**
- 推理引擎是 Rust/CUDA/C++，Console API 是 TypeScript，技术栈差异大
- 推理需要独占 GPU 资源，管理服务混部会浪费 GPU
- 推理服务按 QPS 扩缩容，管理服务按请求量扩缩容——两者弹性曲线完全不同
- 管理服务挂了不影响推理继续（降级而非停服）——这是最重要的可用性保障
- 网关在推理引擎之外做冷启动排队——如果网关嵌入推理引擎，排队逻辑会和推理调度互相阻塞

**为什么有独立的 Gateway 层（而非嵌入 Control Plane 或 Data Plane）：**
- Body-based 路由是推理特有的需求——标准 API 网关（Kong、Nginx）不理解请求 body 里的 `model` 字段。详见 ADR-002。
- 认证和限流集中在网关，避免推理引擎 Pod 各自实现——每个 Pod 的 CPU 周期都应留给推理
- 冷启动排队是网关独有的能力（后端不可用时等待而非直接返回 503），Control Plane 和 Data Plane 都不应承担这个职责
- Gateway 与 Zealot 推理引擎同一技术栈（Rust），不增加团队语言负担

**为什么不用 Service Mesh（Istio）替代 Gateway：**
- Istio 面向服务间通信（东西向），Gateway 面向外部客户端（南北向）
- Istio+Envoy 的运维复杂度远超一个 3-5 KLOC 的 Rust 二进制
- AI 推理的 SSE 流式透传 + 计费侧录在 Envoy 的 filter 链里同样难做——问题不在 Istio vs Kong，而在于通用网关 vs 专用网关

---

## Consequences

**正面：**
- 各层独立部署、独立扩缩容、独立容错
- Gateway 做统一安全策略，Cloud LB 补充 DDoS 和 TLS
- 新增推理模型、新增管理功能互不影响
- Gateway 和 Data Plane 同为 Rust 栈，Control Plane 独立 TypeScript——技术边界和团队边界一致

**负面：**
- 三层比单体多一次网络跳转（Gateway → Data Plane），增加 2-5ms 延迟（可接受）
- 需要跨层分布式 tracing（OpenTelemetry）
- Gateway 和 Control Plane 之间的路由表同步需要额外机制（Redis pubsub 或 K8s CRD）

**含与后续 ADR 的对齐：**
- ADR-002：Gateway 选型为自研 Gateway（Rust），弃用 Kong
- ADR-003：Data Plane 引擎为 vLLM → Zealot 自研路线
- ADR-004：GPU 调度为 KAI Scheduler
- ADR-009：Zealot 推理引擎语言栈（Python 兼容层 + Rust 内核 + CUDA 计算，PyO3 直接 FFI 无胶水层）

**待跟进：**
- 建立统一的分布式 tracing（OpenTelemetry 跨 Gateway → Engine Pod → Console API）
- 定义各层 SLO：Gateway 99.9%、Data Plane 99.9%（推理 SLA）、Control Plane 99.5%
