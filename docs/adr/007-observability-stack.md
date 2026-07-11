# ADR-007: 可观测性栈

**日期**: 2026-07-11  
**状态**: accepted  
**依赖**: ADR-000（Platform Object Model）、ADR-001（架构总览）、ADR-006（数据存储）

> **对象定位**: 可观测性栈采集三种对象的数据——Worker/GPUCard 的实时指标（Prometheus）、InferenceSession 的执行记录（ClickHouse）、所有对象的日志（Loki）。

---

## Context

GPU 推理平台的可观测性需求超越典型 Web 应用：

1. **三层都要监控**：Gateway、Control Plane（Console API、Auth Service）、Data Plane（Zealot/vLLM + K8s）
2. **GPU 指标独特**：利用率、显存、温度、功耗（DCGM/NVML 指标）
3. **推理指标**：TTFT（首 token 延迟）、TPOT（每 token 延迟）、queue depth、error rate
4. **业务指标**：token 消耗、费用、API 调用次数
5. **AI 辅助诊断**：Incident 自动创建 + LLM 根因分析

按 ADR-006 的领域划分，Observability 域由 **ClickHouse（指标）+ Loki（日志）** 组成，**Prometheus + Grafana + AlertManager** 是采集、可视化和告警层。

---

## Decision

```
                              ┌──────────────┐
                              │   Grafana    │  ← 统一可视化
                              └──────┬───────┘
                  ┌──────────────────┼──────────────────┐
                  │                  │                  │
          ┌───────▼──────┐  ┌───────▼──────┐  ┌───────▼──────┐
          │  Prometheus  │  │  ClickHouse  │  │  AlertMgr    │
          │  (实时指标)   │  │  (长期存储)   │  │  (告警)       │
          │  15天保留     │  │  分析查询     │  └──────┬───────┘
          └──────┬───────┘  └──────┬───────┘         │
                 │                 │           Slack / Email
    ┌────────────┼─────────┐       │
    │            │         │       │
┌───▼──┐  ┌─────▼──┐ ┌───▼───┐   │
│ DCGM │  │Gateway │ │Zealot │   │
│ GPU  │  │metrics │ │metrics│   │
└──────┘  └────────┘ └───────┘   │
                                  │
                          ┌───────▼──────┐
                          │    Loki      │  ← 日志
                          │  (S3 backend)│
                          └──────┬───────┘
                                 │
                         ┌───────▼──────┐
                         │   Promtail   │
                         └──────┬───────┘
                    ┌───────────┼───────────┐
               ┌────▼────┐ ┌───▼────┐ ┌────▼────┐
               │ App     │ │Infer   │ │ Audit   │  ← 三类日志分开
               │ Logs    │ │Logs    │ │ Logs    │
               └─────────┘ └────────┘ └─────────┘
```

**Prometheus**：实时指标采集 + 告警规则 + 短期保留（15 天）。  
**ClickHouse**：长期存储 GPU 指标 + 请求事件分析副本（从 PostgreSQL 异步复制，source of truth 在 PostgreSQL，见 ADR-006）。  
**Loki + S3**：三类日志（应用/推理/审计），低成本长期存储。  
**Grafana**：统一面板——Prometheus 数据源 + ClickHouse 数据源 + Loki 数据源，同一视图。

---

## Rationale

### 为什么全开源栈（不选 Datadog 等 SaaS）

| 维度 | 开源栈 | SaaS（Datadog）|
|------|--------|---------------|
| 成本 | 仅 S3 存储费 | 按 GB 收费，GPU 指标极贵 |
| GPU 指标 | DCGM Exporter 原生 Prometheus | 需要 agent，指标采集不全 |
| 推理指标 | vLLM/Zealot 原生 `/metrics` 端点 | 需要自定义 |
| 控制力 | 数据在自己手里 | 数据在外部 |

关键原因：**GPU 产生海量指标**（每卡每 15s 一条，一个 8 卡节点每天 46,080 条）。SaaS 按数据量收费成本极高。

### Prometheus vs ClickHouse 的分工

| | Prometheus | ClickHouse |
|---|-----------|------------|
| 用途 | 实时告警 + 短期监控面板 | 长期存储 + 分析查询 |
| 保留 | 15 天 | 永久 |
| 查询 | PromQL（简单聚合） | SQL（复杂分析、JOIN） |
| 典型场景 | "过去 5 分钟 GPU 利用率是否异常" | "本月 Llama 70B 的 P99 TTFT 趋势" |

**Phase 1**：只跑 Prometheus。ClickHouse schema 按 ADR-006 提前定义，数据可通过 Prometheus remote write 或直接采集写入，Phase 2 部署。

### 为什么 Grafana 作为统一平台

- 指标（Prometheus + ClickHouse）+ 日志（Loki）+ 告警（AlertManager）都在 Grafana 面板展示
- Console UI 可以内嵌 Grafana iframe 展示 GPU 利用率图表
- 不需要在 Grafana 和 Kibana 之间切换

### 日志分类

不把所有日志倒进一个 Loki stream。三个独立 stream：

| Stream | 内容 | 标签 | level |
|--------|------|------|-------|
| **App Logs** | Gateway、Console API、Auth Service | `{service, level}` | info+ |
| **Inference Logs** | vLLM/Zealot 引擎日志 | `{model, request_id, level}` | warn+（不要 debug） |
| **Audit Logs** | 敏感操作（创建 API Key、删除 Endpoint） | `{user_id, action, resource}` | 全量 |

推理日志默认 level=warn——debug 日志会把 Loki 淹没。

### AI 诊断

Phase 2d 的 AI Incident Diagnosis 不改变可观测性栈本身，它是下游消费者：

```
Prometheus Alert → Incident 创建 → 自动收集 metrics (Prometheus) + logs (Loki)
→ 构造 prompt → 调用内部 LLM → 返回根因分析
```

---

## Consequences

**正面：**
- 成本可控（仅 S3 存储费 + Prometheus/ClickHouse 服务器）
- K8s 生态深度集成（Prometheus Operator + ServiceMonitor CRD）
- vLLM/Zealot、DCGM、Gateway 都有原生 Prometheus exporter
- ClickHouse 提前定义 schema，Phase 2 无痛迁移

**负面：**
- Prometheus 长期存储需要 ClickHouse 或 Thanos（Phase 1 15 天本地保留够用）
- 团队需维护 Prometheus + Grafana + Loki + ClickHouse 四套运维
- DCGM Exporter 指标定义复杂，dashboard 模板需时间定制

**待跟进：**
- Prometheus recording rules（预聚合 GPU 指标，减少 Grafana 实时计算）
- 告警分级：P1（5min 响应）、P2（30min）、P3（工作日）
- Grafana dashboard 模板：Cluster Overview / GPU Detail / Cost Attribution / Gateway Latency
- Prometheus → ClickHouse 的数据管道设计（remote write vs 独立 scraper）
