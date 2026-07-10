# Ultralisk Console 产品需求文档（PRD）

> **状态**：v0.2  
> **日期**：2026-07-10  
> **范围**：Ultralisk Web Console（控制台）  
> **目标读者**：产品经理、设计师、前端/后端工程师  
> **参考**：项目内对标文档 + together.ai 控制台截图

---

## 1. 背景

Ultralisk 定位为 **Together AI 的推理能力 + Chamber 的 GPU 管控能力 + 私有化部署**。控制台是用户与 Ultralisk 交互的主入口，需要同时服务三类用户：

1. **AI 开发者**：调用 API、调试提示词、查看用量。
2. **ML/Platform 团队**：部署模型、监控 GPU、优化成本。
3. **企业管理员**：权限、审计、合规、私有化交付。

---

## 2. 目标

- **Phase 1（1-3 月）**：交付开发者优先的公有云 API 控制台，让新用户在 5 分钟内发出第一个 API 请求。
- **Phase 2（4-6 月）**：增加 Operations 模块，提供 GPU 利用率、成本归因、集群/节点管理能力。
- **Phase 3（7-12 月）**：支持私有化交付，同一套控制台可在客户数据中心运行。

---

## 3. 范围

### 3.1 In Scope

- 统一的 Web Console（单页应用）。
- Phase 1：Dashboard、Models、Playground、API Keys、Endpoints、Batch Jobs、Billing/Cost Analytics。
- Phase 2：Operations 模块（Clusters、Nodes、Deployments、GPU Utilization、Cost Analytics）。
- Phase 3：私有化控制台、Setup Wizard、Audit Logs、SSO、合规视图。
- 支持 light / dark / system 主题。
- OpenAI 兼容的 API 体验。

### 3.2 Out of Scope（Phase 1-2）

- 模型训练/预训练功能（Fine-tuning 仅 Phase 2+ 评估）。
- Code Sandbox。
- 自研推理引擎或 CUDA Kernel 相关界面。
- 多区域选择（Phase 1 单区域）。

---

## 4. 用户画像与用户故事

### 4.1 AI 开发者 — Alex

> 独立开发者，想快速接入一个高性价比的 OpenAI 兼容 API。

- **故事 1**：作为开发者，我希望注册后 30 秒内看到可复制的 API 代码，以便立刻测试。
- **故事 2**：作为开发者，我希望能零代码体验不同模型，以便选择最适合我场景的模型。
- **故事 3**：作为开发者，我希望清晰看到我的用量和费用，以便控制成本。

### 4.2 ML Engineer — Bella

> 负责在公司内部部署和运维大模型推理服务。

- **故事 4**：作为 ML Engineer，我希望为某个模型创建专属 endpoint，以便团队稳定调用。
- **故事 5**：作为 ML Engineer，我希望看到模型部署的 GPU 利用率和延迟，以便优化配置。
- **故事 6**：作为 ML Engineer，我希望发起批量推理任务，以便低成本处理大量数据。

### 4.3 Platform / SRE — Charlie

> 负责 GPU 集群的可用性和成本。

- **故事 7**：作为 SRE，我希望看到集群和节点的健康状态，以便及时发现故障。
- **故事 8**：作为 SRE，我希望按团队/项目拆分 GPU 成本，以便做内部结算。
- **故事 9**：作为 SRE，我希望设置预算告警，以便避免超支。

### 4.4 企业管理员 — Diana

> 金融/医疗/政务行业 IT 负责人，数据不能出域。

- **故事 10**：作为企业管理员，我希望把 Ultralisk 部署在我们自己的数据中心，以便满足合规要求。
- **故事 11**：作为企业管理员，我希望看到完整的审计日志和 SSO 集成，以便通过内部安全审计。

---

## 5. 功能需求

### 5.1 Dashboard（首页）

**需求编号**：CON-001

| 需求 | 优先级 | 验收标准 |
|------|--------|---------|
| 未充值用户顶部显示充值引导 banner | P0 | 用户进入 Dashboard 可见，点击跳转充值页。 |
| Developer Quickstart 代码片段 | P0 | 默认展示 Python 代码，支持切换 TypeScript / curl；默认模型为 Llama 3.1 8B Instruct。 |
| 用量摘要卡片 | P0 | 展示今日 requests / tokens / 费用 / 剩余额度，数据实时或近实时。 |
| 快捷操作入口 | P0 | Manage API keys / API reference / Explore models / Open Playground。 |
| 最近 API 活动 | P1 | 展示最近 10 次调用：时间、模型、状态码、延迟、token 数。 |
| 示例与资源卡片 | P1 | 4-6 个卡片：Build a chatbot / RAG app / Agent / Structured output。 |

### 5.2 Models（模型目录）

**需求编号**：CON-002

| 需求 | 优先级 | 验收标准 |
|------|--------|---------|
| Featured Models 卡片区 | P0 | 顶部展示 4 个主推模型，每张卡片含名称、作者、capability tags、价格、Open in Playground 按钮。 |
| Browse Models 表格 | P0 | 列包含：Model Name / Author / Category / Serverless Pricing / Batch Pricing / Status / Actions。 |
| 模型筛选 | P0 | 支持按 Deployment（Serverless / Dedicated）、Category、Features 筛选。 |
| 模型搜索 | P0 | 支持按名称/作者搜索。 |
| 模型详情入口 | P1 | 点击模型进入详情页，展示能力、价格、API 示例、限制说明。 |
| 自定义模型入口 | P2 | 提供 "Deploy custom model" 按钮，Phase 1 可跳转至等待列表或文档。 |

### 5.3 Playground（模型体验）

**需求编号**：CON-003

| 需求 | 优先级 | 验收标准 |
|------|--------|---------|
| 模型选择器 | P0 | 顶部 dropdown 选择模型，显示 capability tags。 |
| 系统提示词输入 | P0 | 可编辑 System Prompt。 |
| 多轮对话 | P0 | 支持 user / assistant 消息，可重新编辑、重新生成、复制。 |
| 参数面板 | P0 | Max Tokens / Temperature / Top P / Stop / Frequency Penalty / Presence Penalty / Response Format。 |
| API view | P0 | 一键生成当前配置的 curl / Python / TypeScript 代码。 |
| 流式输出 | P0 | 支持 SSE 流式展示响应。 |
| Tools / Function Calling | P2 | Phase 2 支持添加 functions。 |

### 5.4 API Keys

**需求编号**：CON-004

| 需求 | 优先级 | 验收标准 |
|------|--------|---------|
| Key 列表 | P0 | 展示名称、前缀、创建人、创建时间、最后使用、角色、状态。 |
| 创建 Key | P0 | 表单：名称、角色（Admin/Developer/Read-only）、可选模型白名单、可选月度额度上限。 |
| Secret 仅展示一次 | P0 | 创建成功后弹窗显示完整 key，后续列表仅显示前缀。 |
| 撤销与轮换 | P0 | 支持一键撤销；轮换流程生成新 key 并提示替换旧 key。 |
| Key 用量统计 | P1 | 每个 key 的 requests / tokens / cost。 |

### 5.5 Endpoints（推理端点）

**需求编号**：CON-005

> **Phase 1 范围说明**：Phase 1 仅支持 **Serverless** 和 **Reserved** 类型端点；**Dedicated** 类型（独占 GPU）放到 Phase 2，因此创建表单中 GPU 规格和副本数配置在 Phase 1 隐藏或置灰。

| 需求 | 优先级 | 验收标准 |
|------|--------|---------|
| Endpoint 列表 | P0 | 展示名称、模型、类型（Serverless / Reserved / Dedicated）、状态、创建时间。 |
| 创建 Endpoint | P0 | 选择模型、类型；Dedicated 选择 GPU 规格和副本数（Phase 2）。 |
| 指标 mini | P1 | 展示 QPS / TTFT p95 / TPOT / Error rate / GPU utilization。 |
| 自动扩缩容策略 | P1 | Reserved/Dedicated 支持配置 min/max replicas（Phase 2）。 |

### 5.6 Batch Jobs

**需求编号**：CON-006

| 需求 | 优先级 | 验收标准 |
|------|--------|---------|
| Job 列表 | P0 | 展示名称、模型、状态、提交时间、完成时间、tokens、折扣后费用。 |
| 创建 Batch Job | P0 | 上传 JSONL、选择模型、配置回调 URL、选择输出格式。 |
| 结果下载 | P0 | 完成后可下载结果 JSONL。 |
| 错误日志 | P1 | failed 任务展示失败样本和原因。 |

### 5.7 Billing & Cost Analytics（Phase 1 基础版）

**需求编号**：CON-007

| 需求 | 优先级 | 验收标准 |
|------|--------|---------|
| 余额与充值 | P0 | 展示当前余额、充值入口、自动充值开关。 |
| 账单列表 | P0 | 历史账单列表，支持下载 invoice。 |
| 按模型拆分 | P0 | 饼图/柱状图展示各模型用量和费用。 |
| 按 API key 拆分 | P1 | 表格展示各 key 用量和费用。 |
| 时间范围 | P0 | 今天 / 7 天 / 30 天 / 自定义。 |

### 5.8 Operations 模块（Phase 2）

#### 5.8.1 Clusters

**需求编号**：CON-008

| 需求 | 优先级 | 验收标准 |
|------|--------|---------|
| 集群列表 | P1 | 名称、区域、GPU 类型、节点数、健康状态、平均 GPU 利用率。 |
| 集群详情 | P1 | 节点列表、网络拓扑、告警。 |

#### 5.8.2 Nodes

**需求编号**：CON-009

| 需求 | 优先级 | 验收标准 |
|------|--------|---------|
| 节点列表 | P1 | 主机名、GPU 型号、数量、显存使用率、温度、驱动/CUDA 版本。 |
| 节点详情 | P1 | 每卡利用率、显存、进程、历史趋势。 |

#### 5.8.3 Deployments

**需求编号**：CON-010

| 需求 | 优先级 | 验收标准 |
|------|--------|---------|
| 部署列表 | P1 | 模型、关联 endpoint、副本数、GPU 分配、状态。 |
| 扩缩容与回滚 | P1 | 手动调整副本数、版本回滚。 |

#### 5.8.4 GPU Utilization

**需求编号**：CON-011

| 需求 | 优先级 | 验收标准 |
|------|--------|---------|
| 总览 | P1 | 总 GPU 数 / 平均利用率 / 空闲 GPU 数 / 排队请求数。 |
| 按模型拆分 | P1 | 每个模型占用的 GPU 和利用率。 |
| 按租户拆分 | P2 | 多租户下各团队使用情况。 |
| 时序图表 | P1 | 支持多维度下钻的 Prometheus/Grafana 风格图表。 |

#### 5.8.5 Cost Analytics（增强版）

**需求编号**：CON-012

| 需求 | 优先级 | 验收标准 |
|------|--------|---------|
| 成本归因 | P1 | 按模型 / endpoint / API key / 团队 / 项目拆分。 |
| GPU-hour cost | P1 | 把 token 费用和 GPU 时间成本关联。 |
| 预算告警 | P1 | 设置月度预算，超阈值邮件/Slack 告警。 |

### 5.9 私有化控制台（Phase 3）

**需求编号**：CON-013

| 需求 | 优先级 | 验收标准 |
|------|--------|---------|
| Setup Wizard | P1 | 引导完成 K8s 接入、存储配置、GPU 节点注册、License 激活。 |
| Offline Model Registry | P1 | 支持导入 HuggingFace / 本地模型，不依赖外网。 |
| 审计日志 | P0 | 用户操作、API 调用、模型部署全量审计，支持导出。 |
| RBAC + SSO | P0 | 与企业 SSO/SAML 集成，细粒度角色权限。 |
| 合规视图 | P1 | SOC2 / ISO27001 状态展示、数据保留策略。 |
| License & Support | P1 | 显示软件许可、授权 GPU 数量、支持合约。 |

### 5.10 异常与边界场景

**需求编号**：CON-014

| 场景 | 触发条件 | 预期行为 |
|------|---------|---------|
| 余额不足 | 账户余额 ≤ 0 或低于单次调用费用 | API 调用返回 `402 Payment Required`；Dashboard 显示红色告警 banner；Playground 禁用提交并提示充值。 |
| API Key 无效 | 请求使用已撤销或错误 key | 返回 `401 Unauthorized`；控制台 Recent activity 显示失败状态。 |
| 模型暂时不可用 | 后端该模型过载或维护中 | Models 页面该模型显示 "Unavailable" 标签；Playground 中该模型置灰并提示。 |
| Endpoint 部署失败 | Dedicated/Reserved endpoint 创建或扩缩容失败 | Endpoints 列表状态为 "Failed"；详情页展示错误日志和重试按钮；发送通知。 |
| Batch Job 失败 | 输入格式错误、模型异常、资源不足 | 状态为 "Failed"；展示前 10 条失败样本和错误原因；允许部分结果下载（如已处理部分）。 |
| GPU 节点掉线 | Prometheus 检测不到节点心跳 | Nodes 列表该节点标红；Clusters 详情页显示告警；发送邮件/Slack 告警。 |
| GPU 利用率持续为 0 | Endpoint 运行但无流量超过 15 分钟 | GPU Utilization 页面标黄提示；Deployments 列表显示 "Underutilized" 标签。 |
| 网络断开（控制台端） | 用户侧网络异常 | 全局 toast 提示 "Connection lost, retrying..."；SSE/WebSocket 自动重连。 |
| 权限不足 | 只读用户尝试创建 API Key | 按钮置灰或隐藏；操作提交后返回 `403 Forbidden`，控制台提示无权限。 |
| 大量 GPU 数据涌入 | 实时指标数据点过多 | 前端按 30s/5min/1h 聚合采样；图表默认展示聚合视图，支持下钻到原始数据。 |

---

## 6. 非功能需求

| 编号 | 类别 | 需求 | 优先级 |
|------|------|------|--------|
| NF-001 | 性能 | 页面首屏加载 < 2s（非首次加载）；API 列表 < 500ms。 | P0 |
| NF-002 | 可用性 | 支持 light / dark / system theme。 | P0 |
| NF-003 | 安全 | API key 仅创建时可见；敏感操作二次确认。 | P0 |
| NF-004 | 安全 | 从 Phase 1 起预留 RBAC 角色模型。 | P0 |
| NF-005 | 国际化 | 架构预留 i18n，Phase 1 英文优先。 | P1 |
| NF-006 | 可访问性 | 符合 WCAG 2.1 AA 基本要求。 | P1 |
| NF-007 | 私有化 | Console 与 Backend API 解耦，支持独立部署包。 | P1 |

---

## 7. 设计原则

1. **开发者优先**：Phase 1 把 Dashboard、Playground、API Keys、Models 放最浅。
2. **渐进暴露**：GPU/集群/成本归因收在 Operations 模块，不干扰开发者。
3. **OpenAI 兼容**：API 文档、模型命名、参数面板对齐 OpenAI 习惯。
4. **精选模型**：不做 200+ 模型目录；每个场景 2-3 个最优选择。
5. **透明成本**：价格、用量、成本归因随处可见。

---

## 8. 信息架构

```
Top Bar
├── Logo / Project Switcher
├── Global Search
├── Docs
└── User / Org / Billing menu

Left Sidebar
├── Home
│   └── Dashboard
├── Develop
│   ├── Playground
│   ├── Models
│   └── API Keys
├── Inference
│   ├── Endpoints
│   └── Batch Jobs
├── Operations (Phase 2)
│   ├── Clusters
│   ├── Nodes
│   ├── Deployments
│   ├── GPU Utilization
│   └── Cost Analytics
├── Model Shaping (Phase 2+)
│   ├── Fine-tuning Jobs
│   └── Evaluations
├── Organization
│   ├── General
│   ├── Members
│   ├── Billing
│   └── Cost Analytics
└── Settings
    ├── Profile
    ├── SSH Keys
    └── Integrations
```

---

## 9. 数据需求

Console 需要展示/管理以下核心实体：

- **User / Organization / Project / Members**：用户与权限体系。
- **ApiKey**：访问凭证，含角色、模型白名单、额度限制。
- **Model**：模型元数据、能力标签、定价。
- **Endpoint**：推理端点，含类型、副本、GPU 规格、扩缩容策略。
- **BatchJob**：批量任务，含输入/输出文件、状态、费用。
- **Cluster / Node / GpuCard**：GPU 基础设施（Phase 2）。
- **Deployment**：模型部署实例（Phase 2）。
- **BillingRecord / CostAllocation**：账单与成本归因。
- **AuditLog**：审计日志（Phase 3）。

### 9.1 多租户模型

Ultralisk 采用 **Organization → Project → Resource** 三级隔离：

> **Phase 1 边界**：每个 Organization 默认只有一个 Project，项目级隔离在 Phase 2 完整实现。Phase 1 所有资源归属默认 Project，Billing 在 Organization 层级管理。

```
Organization（企业/团队）
├── Members（用户 + org_role: owner/admin/billing）
├── Billing & Budget（组织级账单和预算）
├── Projects（项目/子团队）
│   ├── ApiKeys（项目级 API key）
│   ├── Endpoints（项目级推理端点）
│   ├── BatchJobs（项目级批量任务）
│   └── CostAllocation（项目级成本）
└── Clusters / Nodes（Phase 2：组织级共享基础设施）
```

**隔离规则**：

| 资源 | 归属层级 | 可见范围 |
|------|---------|---------|
| User / Member | Organization | 同组织内可见 |
| API Key | Project | 同项目内可见 |
| Endpoint | Project | 同项目内可见 |
| Batch Job | Project | 同项目内可见 |
| Cluster / Node | Organization | 同组织内可见（SRE/Admin 角色） |
| Billing | Organization | Owner / Admin / Billing 角色 |
| Audit Log | Organization | Admin 及以上 |

**角色权限矩阵（Phase 1 预留）**：

| 能力 | Owner | Admin | Developer | Read-only | Billing |
|------|-------|-------|-----------|-----------|---------|
| 管理成员 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 管理账单 | ✅ | ✅ | ❌ | ❌ | ✅ |
| 创建 API Key | ✅ | ✅ | ✅ | ❌ | ❌ |
| 创建 Endpoint | ✅ | ✅ | ✅ | ❌ | ❌ |
| 查看 Operations | ✅ | ✅ | ✅ | ✅ | ❌ |
| 查看 Billing | ✅ | ✅ | ❌ | ❌ | ✅ |
| 查看 Audit Log | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## 10. API 需求

Console 依赖 Backend 提供以下 API（详细契约见 `docs/prd-console-api.md`）：

| 端点 | 用途 | 阶段 |
|------|------|------|
| `GET /v1/models` | 模型目录 | Phase 1 |
| `GET /v1/models/:id` | 模型详情 | Phase 1 |
| `POST /v1/chat/completions` | 聊天补全 | Phase 1 |
| `POST /v1/embeddings` | Embedding | Phase 1 |
| `GET /v1/api-keys` | API Key 列表 | Phase 1 |
| `POST /v1/api-keys` | 创建 API Key | Phase 1 |
| `POST /v1/api-keys/:id/revoke` | 撤销 API Key | Phase 1 |
| `POST /v1/api-keys/:id/rotate` | 轮换 API Key | Phase 1 |
| `GET /v1/endpoints` | Endpoint 列表 | Phase 1 |
| `POST /v1/endpoints` | 创建 Endpoint | Phase 1 |
| `GET /v1/gpu-types` | GPU 规格与定价 | Phase 1 |
| `GET /v1/batch-jobs` | Batch Job 列表 | Phase 1 |
| `POST /v1/batch-jobs` | 创建 Batch Job | Phase 1 |
| `GET /v1/usage/summary` | 用量摘要 | Phase 1 |
| `GET /v1/activity/recent` | 最近 API 活动 | Phase 1 |
| `GET /v1/billing/balance` | 余额 | Phase 1 |
| `GET /v1/billing/usage` | 账单使用明细 | Phase 1 |
| `GET /v1/billing/invoices` | 账单列表 | Phase 1 |
| `GET /v1/billing/cost-by-api-key` | 按 API Key 拆分费用 | Phase 1 |
| `GET /v1/clusters` | 集群列表 | Phase 2 |
| `GET /v1/nodes` | 节点列表 | Phase 2 |
| `GET /v1/gpu-utilization` | GPU 利用率 | Phase 2 |
| `GET /v1/cost-analytics` | 成本归因 | Phase 2 |
| `GET /v1/audit-logs` | 审计日志 | Phase 3 |

实时数据（GPU 监控、Playground 流式）使用 SSE 或 WebSocket。

---

## 11. 安全与合规

- API key 采用只显示一次策略，列表仅展示前缀。
- 敏感操作（撤销 key、删除 endpoint、删除 batch job）需二次确认。
- Phase 1 预留 Admin / Developer / Read-only 三种角色。
- Phase 3 支持企业 SSO/SAML、审计日志、数据保留策略。

---

## 12. 成功指标

| 指标 | 目标 |
|------|------|
| Time to first API call | 新用户注册后 < 5 分钟 |
| Playground → API key 转化率 | > 30% |
| 控制台 DAU/WAU | 持续增长 |
| Operations 页面访问占比 | Phase 2 后 > 20% |
| 私有化交付周期 | 签约到控制台可用 < 2 周 |

---

## 13. 里程碑

| 阶段 | 周期 | 交付物 |
|------|------|--------|
| Phase 1 | 1-3 月 | Dashboard、Models、Playground、API Keys、Endpoints、Batch Jobs、Billing。 |
| Phase 2 | 4-6 月 | Operations 模块、多租户、增强 RBAC、Cost Analytics。 |
| Phase 3 | 7-12 月 | 私有化控制台、Setup Wizard、Audit Logs、SSO、合规视图。 |

---

## 14. 风险与依赖

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 后端 API 未就绪 | 控制台无法联调 | 先用 mock 数据构建前端，定义好 API 契约。 |
| 实时 GPU 数据量大 | 前端性能问题 | 采样 + 聚合 + 按需下钻。 |
| 私有化打包复杂 | 交付周期拉长 | Console 与 Backend 严格解耦，提供 Helm chart / installer。 |
| 多角色权限模型设计不足 | 后续扩展困难 | Phase 1 预留 RBAC 数据模型。 |

---

## 15. 已确认决策

| 问题 | 决策 | 理由 |
|------|------|------|
| Phase 1 注册模式 | **Invitation-only + 申请试用** | 早期控制成本、避免滥用；付费后开放注册。 |
| 前端组件库 | **shadcn/ui + Tailwind CSS** | 与 React/TypeScript 生态契合，自定义能力强，适合 B2B 控制台。 |
| 文档站点 | **外链独立 docs 站点（docs.ultralisk.io）** | 便于 SEO、版本管理和私有化时独立部署。 |
| 私有化前端代码库 | **复用同一份代码库** | 通过环境变量/构建配置切换 SaaS/私有化模式，降低维护成本。 |
| Phase 1 移动端 | **仅保证桌面端可用，不做移动端适配** | 控制台是生产力工具，首屏使用场景在桌面；响应式基础即可。 |
| 主题 | **默认 light，支持 dark / system** | 参考 Together AI 截图，开发者控制台以浅色为主。 |

---

## 16. 用户流程

### 16.1 开发者首次体验流程

```
注册/邀请激活
    │
    ▼
进入 Dashboard
    │
    ├── 看到 Developer Quickstart 代码片段
    │   └── 点击「复制」或「在 Playground 中打开」
    │
    ▼
创建 API Key（如果还没有）
    │
    ▼
在本地运行第一个 API 请求
    │
    ▼
返回 Dashboard 查看 Recent activity 和用量
```

**关键转化点**：
- Dashboard → Playground：体验零代码调试。
- Playground → API Key 创建：准备接入生产。
- API Key → 首次本地调用：验证产品价值。

### 16.2 ML Engineer 部署模型流程

```
进入 Models
    │
    ▼
选择模型 → 点击 Deploy / Create Endpoint
    │
    ▼
配置 Endpoint（类型、GPU 规格、副本数、扩缩容）
    │
    ▼
提交部署，等待状态变为 Active
    │
    ▼
在 Endpoints 页面获取 endpoint URL
    │
    ▼
在 Operations / GPU Utilization 监控运行状态
    │
    ▼
根据利用率调整副本数或扩缩容策略
```

### 16.3 SRE 排查 GPU 故障流程

```
收到 GPU 节点告警（邮件/Slack）
    │
    ▼
进入 Operations / Clusters
    │
    ▼
查看异常集群的健康状态和节点列表
    │
    ▼
进入 Nodes 查看掉线节点详情和错误日志
    │
    ▼
定位问题：驱动异常 / 网络断开 / 显存溢出
    │
    ▼
采取措施或联系支持团队
```

### 16.4 私有化交付流程

```
签署私有化合同
    │
    ▼
客户运行 Setup Wizard
    │
    ├── 接入 K8s 集群
    ├── 配置存储
    ├── 注册 GPU 节点
    └── 激活 License
    │
    ▼
导入离线模型到 Model Registry
    │
    ▼
创建 Endpoint 并验证推理
    │
    ▼
配置 SSO 和成员权限
    │
    ▼
启用 Audit Log 和合规视图
```

---

## 17. 关键页面线框

### 17.1 Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│ [Banner] You're in read-only mode. Make an initial deposit. │
├─────────────────────────────────────────────────────────────┤
│ Developer Quickstart                                 [docs] │
│ ┌─────────────────────────────────────────────────────┐     │
│ │ [Python] [TypeScript] [curl]                        │     │
│ │ from ultralisk import Ultralisk                     │     │
│ │ client = Ultralisk(api_key="...")                   │     │
│ │ ...                                                 │     │
│ └─────────────────────────────────────────────────────┘     │
├─────────────────────────────────────────────────────────────┤
│ Usage Summary              │ Quick Actions                  │
│ ┌────────┐ ┌────────┐     │ [Manage API keys]              │
│ │Requests│ │ Tokens │     │ [API reference]                │
│ │  1.2K  │ │  345K  │     │ [Explore models]               │
│ └────────┘ └────────┘     │ [Open Playground]              │
│ ┌────────┐ ┌────────┐     │                                │
│ │  Cost  │ │ Balance│     │                                │
│ │ $12.50 │ │ $87.50 │     │                                │
│ └────────┘ └────────┘     │                                │
├─────────────────────────────────────────────────────────────┤
│ Recent Activity            │ Examples & Resources           │
│ ─ 10:23 Llama-70B 200 OK   │ [Build a chatbot]              │
│ ─ 10:15 DeepSeek-V4 200 OK │ [Build RAG app]                │
│ ...                        │ [Build an Agent]               │
└─────────────────────────────────────────────────────────────┘
```

### 17.2 Models

```
┌─────────────────────────────────────────────────────────────┐
│ Featured Models                                             │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│ │ Llama   │ │DeepSeek │ │  Qwen   │ │ Llama   │           │
│ │ 70B     │ │ V4 Pro  │ │  72B    │ │  8B     │           │
│ │ $1.04   │ │ $1.74   │ │ $0.90   │ │ $0.15   │           │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
├─────────────────────────────────────────────────────────────┤
│ [Filters]          │ [Search]  [Deploy custom] [Upload]    │
│ ☑ Serverless       │                                         │
│ ☑ Dedicated        │ Model    Author   Category  Pricing   │
│ Category           │ ─────────────────────────────────────   │
│ ☑ Chat             │ Llama 70B  Meta   chat      $1.04      │
│ ☑ Embedding        │ ...                                     │
│ Features           │                                         │
│ ☑ JSON Mode        │                                         │
│ ☑ Tool Calling     │                                         │
└─────────────────────────────────────────────────────────────┘
```

### 17.3 Playground

```
┌─────────────────────────────────────────────────────────────┐
│ Chat                              [Model ▼] [API view]      │
├───────────────────────────────┬─────────────────────────────┤
│ System Prompt:                │ Settings                    │
│ [Add system prompt    ]       │ Max Tokens      [slider]    │
│                               │ Temperature     [slider]    │
│                               │ Top P           [slider]    │
│ Messages:                     │ Stop            [input]     │
│                               │ Freq. Penalty   [slider]    │
│ [User message 1]              │ Pres. Penalty   [slider]    │
│                               │ Response Format [Text ▼]    │
│ [Assistant response]          │                             │
│                               │ Functions                   │
│                               │ [+ Add Function]            │
├───────────────────────────────┴─────────────────────────────┤
│ [Input box                        ] [attach] [submit]       │
└─────────────────────────────────────────────────────────────┘
```

### 17.4 Operations / GPU Utilization

```
┌─────────────────────────────────────────────────────────────┐
│ GPU Utilization                              [time range ▼] │
├─────────────────────────────────────────────────────────────┤
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌───────────┐ │
│ │ Total GPUs │ │ Avg Util   │ │ Idle GPUs  │ │Queued Req │ │
│ │    64      │ │    62%     │ │     8      │ │    12     │ │
│ └────────────┘ └────────────┘ └────────────┘ └───────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Utilization by Model        │ Utilization by Tenant         │
│ [Line chart]                │ [Stacked area chart]          │
├─────────────────────────────────────────────────────────────┤
│ Per-GPU Breakdown                                           │
│ Node │ GPU │ Util │ Mem Used │ Temp │ Processes            │
│ ...  │ ... │ ...  │ ...      │ ...  │ ...                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 18. 页面级规格（Page-Level Specs）

> **说明**：本节将 Phase 1 核心页面细化到可直接指导前端开发的颗粒度。API 契约（请求/响应字段、错误码、状态机）详见 `docs/prd-console-api.md`。

### 18.1 页面规格模板

每个页面按以下结构描述：

| 字段 | 说明 |
|------|------|
| **Route** | 页面 URL，含动态参数 |
| **Purpose** | 页面核心目标 |
| **Layout** | 整体布局分区 |
| **Components** | 关键组件及行为 |
| **Data** | 页面依赖的数据（来源、字段）|
| **Interactions** | 用户操作与系统反馈 |
| **Empty/Error** | 空态、加载态、错误态 |
| **Permission** | 角色可见/可操作范围 |

---

### 18.2 Dashboard（首页）

| 字段 | 内容 |
|------|------|
| **Route** | `/` |
| **Purpose** | 让新用户在 30 秒内看到可复制的代码，让老用户一眼看到用量和快捷入口。 |
| **Layout** | 垂直单列流：`Top Banner` → `Quickstart Card` → `Usage Summary + Quick Actions` → `Recent Activity + Examples`。 |
| **Components** | 1. `Read-only Banner`：当余额 ≤ 0 或账户为 read-only 时显示，文案 "Make an initial deposit to start using the API"，CTA "Add credits"。<br>2. `Quickstart Card`：Tab 切换 Python / TypeScript / curl；默认模型 `llama-3.1-8b-instruct`；包含可复制代码块和 "Open in Playground" 按钮。<br>3. `Usage Summary`：4 个指标卡片（Requests / Tokens / Cost / Balance），数据范围默认 Today，点击卡片跳转 Billing。<br>4. `Quick Actions`：4 个按钮（Manage API keys / API reference / Explore models / Open Playground）。<br>5. `Recent Activity`：最近 10 条 API 调用，列：时间、模型、状态码（带颜色标签）、延迟、input/output tokens。<br>6. `Examples & Resources`：4 个卡片（Build a chatbot / RAG app / Agent / Structured output），点击打开对应文档。 |
| **Data** | `GET /v1/usage/summary?range=today` → requests, tokens, cost, balance。<br>`GET /v1/activity/recent?limit=10` → list[{time, model, status_code, latency_ms, input_tokens, output_tokens}]。 |
| **Interactions** | 1. Tab 切换时代码块即时更新，URL hash 同步（`#python` / `#typescript` / `#curl`）。<br>2. 点击复制按钮触发 `quickstart_code_copied` 事件并显示 toast "Copied"。<br>3. "Open in Playground" 携带当前模型和 system prompt 跳转 `/playground?model=xxx&system=xxx`。 |
| **Empty/Error** | 空 activity：显示 "No API calls yet. Run your first request from Quickstart."<br>余额不足：Banner 变红，Playground 快捷入口禁用。<br>数据加载失败：卡片显示 "—"，全局 toast "Failed to load usage data. Retry"。 |
| **Permission** | 所有角色可见。Read-only 用户隐藏 "Add credits" 的支付入口，改为提示联系管理员。 |

---

### 18.3 Models（模型目录）

| 字段 | 内容 |
|------|------|
| **Route** | `/models` |
| **Purpose** | 帮助用户发现、筛选、对比可用模型，并一键进入 Playground 或创建 Endpoint。 |
| **Layout** | 顶部 `Featured Models` 横向卡片 → 下方两栏：左侧 Filters，右侧 Browse Models 表格。 |
| **Components** | 1. `Featured Models`：4 张卡片，每张包含模型名、作者、capability tags（如 Chat / JSON Mode / Tool Calling）、Serverless 定价、"Open in Playground" 按钮。<br>2. `Filters`：Deployment（Serverless / Dedicated / Batch）、Category（Chat / Embedding / Code / Vision）、Features（JSON Mode / Tool Calling / Batch）。<br>3. `Search`：按模型名或作者实时搜索，debounce 300ms。<br>4. `Browse Models Table`：列 Model Name / Author / Category / Serverless Pricing / Batch Pricing / Status（Available / Unavailable / Coming soon）/ Actions（Open in Playground / Deploy）。<br>5. `Deploy custom model` 按钮：Phase 1 点击弹出 "Join waitlist" 对话框或跳转文档。 |
| **Data** | `GET /v1/models?deployment=&category=&features=&q=` → list[{id, name, author, category, serverless_pricing, batch_pricing, status, capabilities[]}]。 |
| **Interactions** | 1. Filter/Search 变化时表格本地过滤或重新请求（由实现决定，首次上线建议前端过滤以减少请求）。<br>2. 点击模型行进入 `/models/:modelId`。<br>3. "Deploy" 按钮跳转 `/endpoints/new?model=xxx`。 |
| **Empty/Error** | 无结果：显示 "No models match your filters. Try adjusting your search."<br>模型不可用时 Status 列显示灰色 "Unavailable"，Actions 按钮禁用并 tooltip 说明原因。 |
| **Permission** | 所有角色可见。Read-only 可查看但 "Deploy" 按钮隐藏。 |

---

### 18.4 Model Detail（模型详情）

| 字段 | 内容 |
|------|------|
| **Route** | `/models/:modelId` |
| **Purpose** | 展示单个模型的能力、定价、限制和调用示例，帮助用户决定是否使用该模型。 |
| **Layout** | 顶部模型头图/名称 → Tab 导航：`Overview` / `Pricing` / `API Example` / `Limits`。 |
| **Components** | 1. `Header`：模型名、作者、描述、capability tags、"Open in Playground" / "Deploy" 按钮。<br>2. `Overview` Tab：能力介绍、支持的语言、上下文长度、模型 ID。<br>3. `Pricing` Tab：Serverless input/output 每 1M tokens 价格、Batch 折扣价、Dedicated GPU 按需价格。<br>4. `API Example` Tab：Python / TypeScript / curl 示例，展示 `/v1/chat/completions` 调用。<br>5. `Limits` Tab：max tokens、rate limit、并发限制。 |
| **Data** | `GET /v1/models/:modelId` → 完整模型元数据。 |
| **Interactions** | 1. Tab 切换更新 URL hash（`#pricing` 等）。<br>2. API 示例支持一键复制。 |
| **Empty/Error** | 模型不存在：404 页面，提示 "Model not found" 并返回 `/models`。 |
| **Permission** | 所有角色可见。Read-only 隐藏 Deploy 按钮。 |

---

### 18.5 Playground（模型体验）

| 字段 | 内容 |
|------|------|
| **Route** | `/playground` |
| **Purpose** | 零代码调试模型，体验参数效果，并生成可直接运行的 API 代码。 |
| **Layout** | 顶部 Toolbar → 下方两栏：左侧对话区（2/3），右侧参数面板（1/3）。 |
| **Components** | 1. `Model Selector`：下拉选择模型，显示 capability tags；URL 参数 `?model=xxx` 可预填充。<br>2. `API view Button`：点击展开 drawer，展示当前配置的 curl / Python / TypeScript 代码。<br>3. `System Prompt Input`：可折叠文本框，支持多行。<br>4. `Message List`：user / assistant 消息气泡，支持编辑 user 消息、重新生成、复制 assistant 内容、删除单条。<br>5. `Parameter Panel`：Max Tokens（slider + number input）、Temperature（0-2）、Top P（0-1）、Stop（tag input）、Frequency Penalty（-2~2）、Presence Penalty（-2~2）、Response Format（Text / JSON Object）。<br>6. `Input Area`：多行文本框 + 附件占位 + Submit 按钮；Enter 发送，Shift+Enter 换行。<br>7. `Streaming Output`： assistant 消息逐字显示，支持中断生成。 |
| **Data** | `GET /v1/models?playground=true` → 可用于 Playground 的模型列表。<br>`POST /v1/chat/completions`（stream=true）→ SSE 流式响应。 |
| **Interactions** | 1. 参数变更即时生效，不触发请求，直到用户点击 Send。<br>2. 重新生成时替换最后一条 assistant 消息。<br>3. API view 中的代码包含当前 model、messages、temperature 等完整参数。<br>4. 余额不足或 key 无效时，输入框下方显示红色提示，Submit 禁用。 |
| **Empty/Error** | 首次进入：System Prompt 为空，Messages 区显示占位提示 "Type a message to start chatting"。<br>API 失败：消息气泡内显示错误卡片（status code + message），并提供 Retry。<br>流式中断：已生成内容保留，显示 "Generation stopped"。 |
| **Permission** | 所有角色可用。Read-only 可发送测试请求但受 key 权限限制。 |

---

### 18.6 API Keys（API 密钥管理）

| 字段 | 内容 |
|------|------|
| **Route** | `/api-keys` |
| **Purpose** | 管理项目级 API 密钥，控制访问范围和成本上限。 |
| **Layout** | 顶部 `Create API Key` 按钮 + 搜索框 → 下方表格。 |
| **Components** | 1. `Create Button`：打开创建对话框。<br>2. `Key Table`：列 Name / Prefix（如 `uk_abc***`）/ Created by / Created at / Last used / Role / Status（Active / Revoked）/ Actions（Revoke / Rotate / View usage）。<br>3. `Create Dialog`：表单字段 Name（必填）、Role（Admin/Developer/Read-only）、Allowed models（可选多选）、Monthly quota（可选 USD 上限）。<br>4. `Secret Reveal Modal`：创建成功后弹窗展示完整 key，文案 "This is the only time you will see this key"，支持复制并关闭。<br>5. `Revoke Confirm`：二次确认对话框，提示 "This will immediately disable all requests using this key." |
| **Data** | `GET /v1/api-keys` → list[{id, name, prefix, created_by, created_at, last_used_at, role, status, allowed_models, monthly_quota}]。<br>`POST /v1/api-keys` → 创建并返回完整 key 一次。<br>`POST /v1/api-keys/:id/revoke` → 撤销。<br>`POST /v1/api-keys/:id/rotate` → 轮换生成新 key。 |
| **Interactions** | 1. 创建成功后自动打开 Secret Reveal Modal，列表中新增一行 Prefix。<br>2. Revoke 后状态变为 Revoked，Actions 只剩 "View usage"。<br>3. 点击 Usage 跳转 Billing 并自动按该 key 过滤。 |
| **Empty/Error** | 无 key：显示 "No API keys yet. Create your first key to start using the API."<br>创建失败：对话框内显示字段级或全局错误。 |
| **Permission** | Owner/Admin/Developer 可创建、撤销、轮换自己的 key。Read-only 和 Billing 仅可查看列表。 |

---

### 18.7 Endpoints（推理端点）

| 字段 | 内容 |
|------|------|
| **Route** | `/endpoints` |
| **Purpose** | 查看和管理项目下的推理端点，包括 Serverless、Reserved、Dedicated。 |
| **Layout** | 顶部 `Create Endpoint` 按钮 → 表格 → 详情抽屉或独立页。 |
| **Components** | 1. `Create Button`：跳转 `/endpoints/new`。<br>2. `Endpoint Table`：列 Name / Model / Type（Serverless/Reserved/Dedicated）/ Status / Created at / URL（截断显示）/ Actions（View / Edit / Delete）。<br>3. `Status Badge`：Active（绿）、Creating（蓝）、Failed（红）、Terminated（灰）。<br>4. `Mini Metrics`（P1）：QPS / TTFT p95 / Error rate / GPU utilization 小火花图。 |
| **Data** | `GET /v1/endpoints` → list[{id, name, model_id, type, status, created_at, url, metrics}]。 |
| **Interactions** | 1. 点击行进入 `/endpoints/:id` 详情。<br>2. Delete 需二次确认；删除后端点后列表移除。<br>3. Failed 状态显示红色提示并提供 "View logs" 入口。 |
| **Empty/Error** | 无端点：显示 "No endpoints yet. Create one to get a dedicated inference URL." |
| **Permission** | Owner/Admin/Developer 可操作。Read-only 仅查看。 |

---

### 18.8 Create Endpoint（创建端点）

| 字段 | 内容 |
|------|------|
| **Route** | `/endpoints/new?model=xxx` |
| **Purpose** | 引导用户为指定模型创建推理端点。 |
| **Layout** | 单页表单，分步或单步展开。 |
| **Components** | 1. `Model Selector`：默认填充 URL 参数中的 model，可修改。<br>2. `Endpoint Type`：Phase 1 显示 Serverless / Reserved；Dedicated 置灰并标注 "Coming in Phase 2"。<br>3. `Dedicated Config`（Phase 2）：GPU 类型（H100 80GB / H200 / B200）、副本数（min/max）。<br>4. `Auto-scaling Policy`（Phase 2）：min replicas / max replicas / target utilization。<br>5. `Name Input`：自动建议 `{model}-endpoint-01`，用户可改。<br>6. `Cost Estimate`：根据配置实时估算每小时/每月成本。<br>7. `Submit`：创建并跳转 `/endpoints` 列表等待状态变更。 |
| **Data** | `GET /v1/models?deployable=true` → 可部署模型列表。<br>`GET /v1/gpu-types` → 可用 GPU 规格和定价。<br>`POST /v1/endpoints` → 创建。 |
| **Interactions** | 1. 切换 Type 时动态显示/隐藏 GPU 配置。<br>2. 副本数变化时 Cost Estimate 实时更新。<br>3. 提交后跳转列表，新端点状态为 Creating，前端轮询状态。 |
| **Empty/Error** | 余额不足：提交按钮禁用，提示 "Insufficient balance for dedicated endpoint"。<br>创建失败：表单顶部显示错误原因。 |
| **Permission** | Owner/Admin/Developer 可创建。Read-only 无法进入此页面（路由重定向）。 |

---

### 18.9 Batch Jobs（批量任务）

| 字段 | 内容 |
|------|------|
| **Route** | `/batch-jobs` |
| **Purpose** | 查看批量推理任务状态、费用和下载结果。 |
| **Layout** | 顶部 `Create Batch Job` 按钮 → 表格。 |
| **Components** | 1. `Create Button`：跳转 `/batch-jobs/new`。<br>2. `Job Table`：列 Name / Model / Status / Submitted at / Completed at / Input tokens / Output tokens / Discounted cost / Actions（Download / View / Delete）。<br>3. `Status Badge`：Pending / Running / Completed / Failed / Cancelled。<br>4. `Download Result`：Completed 状态可下载 `.jsonl` 结果文件。 |
| **Data** | `GET /v1/batch-jobs` → list[{id, name, model_id, status, submitted_at, completed_at, input_tokens, output_tokens, cost, result_url}]。 |
| **Interactions** | 1. 点击行进入 `/batch-jobs/:id` 详情。<br>2. Failed 状态提供 "View errors" 入口，展示前 10 条失败样本。<br>3. 下载结果时触发浏览器下载。 |
| **Empty/Error** | 无任务：显示 "No batch jobs yet. Batch inference is 50% cheaper than Serverless." |
| **Permission** | Owner/Admin/Developer 可创建/删除。Read-only 仅查看。 |

---

### 18.10 Create Batch Job（创建批量任务）

| 字段 | 内容 |
|------|------|
| **Route** | `/batch-jobs/new` |
| **Purpose** | 上传 JSONL 输入文件并配置批量推理任务。 |
| **Layout** | 单页表单。 |
| **Components** | 1. `Name Input`：任务名称。<br>2. `Model Selector`：选择模型。<br>3. `File Upload`：拖拽或点击上传 `.jsonl`，文件大小限制 100MB、行数预览、前 3 行样例展示。<br>4. `Parameter Panel`：Max tokens / Temperature / Top P / Response format。<br>5. `Callback URL`（可选）：任务完成后的 webhook 地址。<br>6. `Output Format`：默认与输入 JSONL 对齐的 `{"custom_id": "...", "response": {...}, "error": {...}}`。<br>7. `Cost Estimate`：基于输入行数估算折扣后费用。 |
| **Data** | `GET /v1/models?batch=true` → 支持 batch 的模型。<br>`POST /v1/batch-jobs` → 创建任务，支持 multipart/form-data 上传文件。 |
| **Interactions** | 1. 文件上传后前端解析前 3 行做格式校验，错误时提示 "Invalid JSONL format"。<br>2. 提交后跳转 `/batch-jobs` 列表，新任务状态 Pending。<br>3. 支持取消正在 Running 的任务。 |
| **Empty/Error** | 未选文件：Submit 禁用。<br>格式错误：高亮错误行并提示 "Line 5 is not valid JSON"。 |
| **Permission** | Owner/Admin/Developer 可创建。Read-only 无法进入。 |

---

### 18.11 Billing（账单与费用）

| 字段 | 内容 |
|------|------|
| **Route** | `/organization/billing` |
| **Purpose** | 展示余额、充值入口、历史账单和按模型/API key 拆分的费用分析。 |
| **Layout** | 顶部 `Balance Card` + `Add Credits` → 时间范围选择器 → 图表区 → 账单列表。 |
| **Components** | 1. `Balance Card`：当前余额、自动充值开关、充值按钮。<br>2. `Time Range`：Today / 7 days / 30 days / Custom。<br>3. `Usage Charts`：按模型拆分的费用饼图/柱状图、按时间拆分的趋势折线图。<br>4. `Cost by API Key` 表格（P1）：key 名称、requests、tokens、cost。<br>5. `Invoice List`：历史账单月份、金额、状态、下载 PDF。 |
| **Data** | `GET /v1/billing/balance` → balance, auto_recharge_enabled。<br>`GET /v1/billing/usage?range=` → 按模型/时间聚合数据。<br>`GET /v1/billing/invoices` → 历史账单列表。<br>`GET /v1/billing/cost-by-api-key` → 按 key 拆分。 |
| **Interactions** | 1. 时间范围变化时图表和数据重新加载。<br>2. 点击 Download invoice 触发 PDF 下载。<br>3. 自动充值开关切换需二次确认。 |
| **Empty/Error** | 无账单：显示 "No billing history yet."<br>充值失败：toast 提示并保留当前余额。 |
| **Permission** | Owner/Admin/Billing 可查看和管理。Developer/Read-only 隐藏 Billing 入口。 |

---

## 19. 埋点与分析事件

用于验证成功指标和产品优化：

| 事件名 | 触发时机 | 归属指标 |
|--------|---------|---------|
| `user_signed_up` | 用户完成注册 | - |
| `dashboard_viewed` | 进入 Dashboard | DAU/WAU |
| `quickstart_code_copied` | 复制 Quickstart 代码 | Time to first API call |
| `api_key_created` | 创建 API Key | Playground → API key 转化率 |
| `first_api_call_made` | 用户首次成功调用 API | Time to first API call |
| `playground_message_sent` | 在 Playground 发送消息 | Engagement |
| `playground_api_view_opened` | 打开 API view | Playground → API key 转化率 |
| `model_selected_in_playground` | 切换 Playground 模型 | Model adoption |
| `endpoint_created` | 创建 Endpoint | Phase 2 adoption |
| `batch_job_created` | 创建 Batch Job | Phase 1/2 adoption |
| `gpu_utilization_page_viewed` | 进入 GPU Utilization | Operations 页面访问占比 |
| `cost_analytics_page_viewed` | 进入 Cost Analytics | Operations 页面访问占比 |
| `budget_alert_triggered` | 预算告警触发 | Cost control |
| `private_deployment_setup_completed` | 完成私有化 Setup Wizard | 私有化交付周期 |

---

## 20. 附录：参考来源

- `docs/together-ai-analysis.md`
- `docs/together-ai-analysis-technical.md`
- `docs/together-chamber-combined-analysis.md`
- `docs/ultralisk-concept-analysis.md`
- `screenshots/together-dashboard.png`
- `screenshots/together-models.png`
- `screenshots/together-playground.png`
- `screenshots/together-profile.png`
