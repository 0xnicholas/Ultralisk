# Ultralisk Console 产品设计规格书

> **文档状态**：初稿（待评审）  
> **日期**：2026-07-10  
> **作者**：Kimi Code CLI  
> **参考输入**：`docs/together-ai-analysis.md`、`docs/together-ai-analysis-technical.md`、`docs/together-chamber-combined-analysis.md`、`docs/ultralisk-concept-analysis.md`，以及 4 张 together.ai 控制台截图。

---

## 1. 文档目的

本规格书定义 Ultralisk Web Console 的产品设计：

- **Phase 1**：面向开发者的公有云 API 控制台（对标 Together AI，但更聚焦）。
- **Phase 2**：面向 ML/Platform 团队的 GPU 运维与成本归因模块（对标 Chamber，但与推理服务原生集成）。
- **Phase 3**：可私有化交付的企业控制台。

本文档作为后续实现计划（implementation plan）和 UI 设计的输入。

---

## 2. 产品定位

### 2.1 一句话定位

> **Ultralisk Console 是 AI 推理云的统一控制中心——开发者用它调用模型，运维者用它管理 GPU，企业客户还能把它部署在自己的数据中心。**

### 2.2 与竞品的控制台差异

| 维度 | Together AI | Chamber | Ultralisk Console |
|------|------------|---------|-------------------|
| **核心用户** | AI 开发者 | GPU 运维/SRE | 开发者 + 运维 + 企业管理员 |
| **入口体验** | Dashboard + Playground 强 | GPU 监控优先 | 开发者优先，运维能力渐进暴露 |
| **模型目录** | 200+ 模型 | 无 | 精选 10-20 个 |
| **GPU 可见性** | 弱 | 强 | Phase 2 强 |
| **成本归因** | 基础按模型 | 按 GPU/天 | 按模型 / endpoint / key / 团队 |
| **私有化部署** | ❌ | ❌ | ✅ Phase 3 |

---

## 3. 用户画像

| 角色 | 目标 | 高频页面 |
|------|------|---------|
| **AI 开发者** | 快速接入 API、调试提示词、查看用量 | Dashboard、Playground、Models、API Keys |
| **ML Engineer** | 部署模型、监控推理性能 | Endpoints、Deployments、GPU Utilization |
| **Platform / SRE** | 管理 GPU 集群、排查故障、优化成本 | Clusters、Nodes、Cost Analytics |
| **企业管理员** | 合规、审计、成员与权限 | Organization、Settings、Audit Logs（Phase 3） |

---

## 4. 设计原则

1. **开发者优先（Developer-first）**  
   Phase 1 首页 30 秒内可发出第一个请求；Playground 零代码调试。

2. **渐进暴露（Progressive Disclosure）**  
   GPU/集群/成本归因放在 Operations 模块，不干扰开发者主路径。

3. **OpenAI 兼容体验**  
   API 文档、模型命名、参数面板全部对齐 OpenAI 习惯，降低迁移成本。

4. **精选模型（Curated Models）**  
   不做 200+ 模型目录；每个场景保留 2-3 个最优选择。

5. **可私有化架构**  
   Console 与 Backend 通过标准 API 解耦，同一套前端可打包到企业内网。

6. **透明成本**  
   价格、用量、成本归因在控制台随处可见。

---

## 5. 信息架构（IA）

### 5.1 全局布局

```
┌─────────────────────────────────────────────────────────┐
│  Top Bar                                                │
│  Logo │ Project Switcher │ Global Search │ Docs │ User  │
├────────────┬────────────────────────────────────────────┤
│            │                                            │
│  Sidebar   │              Main Content                  │
│  Navigation│                                            │
│            │                                            │
└────────────┴────────────────────────────────────────────┘
```

### 5.2 导航结构

```
Home
└── Dashboard

Develop
├── Playground
├── Models
└── API Keys

Inference
├── Endpoints
└── Batch Jobs

Operations (Phase 2)
├── Clusters
├── Nodes
├── Deployments
├── GPU Utilization
├── Cost Analytics
└── Incidents

Model Shaping (Phase 2+)
├── Fine-tuning Jobs
└── Evaluations

Organization
├── General
├── Members
└── Billing

Settings
├── Profile
├── SSH Keys
└── Integrations
```

### 5.3 导航说明

- **Home / Develop / Inference**：Phase 1 全部可用。
- **Operations**：Phase 2 放出。包含 GPU 监控（Clusters/Nodes/Deployments/GPU Utilization）、成本归因（Cost Analytics）、以及 **AI-Assisted Diagnostics**（Incidents / 自动修复 / Slack ChatOps），是 Ultralisk 对 Chamber 的核心差异化回应。
- **Model Shaping**：优先级低于 Operations，视 Phase 2 资源情况决定是否包含。
- **Organization**：Phase 1 提供 Billing 基础版（余额、账单、按模型/Key 的用量）。Phase 2 在 Operations 下新增独立的 **Cost Analytics**（按团队/项目归因、GPU 小时成本关联、预算告警），两个页面共存，Billing 面向「我花了多少钱」，Cost Analytics 面向「钱花在哪里、为什么」。
- **Settings**：从 Phase 1 起具备基础能力（profile、API keys）。

### 5.4 路由设计

Phase 1a 路由（React Router v7，所有路径相对于 Console 根域名 `console.ultralisk.com`）：

| 路径 | 页面 | Phase | 说明 |
|------|------|-------|------|
| `/` | — | 1a | 重定向到 `/dashboard` |
| `/dashboard` | Dashboard | 1a | 首页：Quickstart、用量卡片、快捷操作 |
| `/playground` | Playground | 1a | 新建空白对话；Mantine AppShell 右侧参数面板 |
| `/playground/:sessionId` | Playground | 1a | 恢复已保存对话（localStorage key） |
| `/models` | Models | 1a | 精选模型列表 + 筛选 |
| `/models/:modelId` | Model Detail | 1a | 单模型详情：能力、价格、代码示例、「Open in Playground」按钮 |
| `/api-keys` | API Keys | 1a | Key 列表管理（创建/撤销/复制） |
| `/billing` | Billing | 1a | 余额、账单、按模型/Key 用量图表 |
| `/settings/profile` | Profile | 1a | 个人信息、主题切换、密码修改 |

Phase 1b 新增：

| 路径 | 页面 | 说明 |
|------|------|------|
| `/endpoints` | Endpoints | 预留/独享端点列表 |
| `/endpoints/new` | Create Endpoint | 创建端点向导 |
| `/endpoints/:id` | Endpoint Detail | 端点详情 + Metrics mini |
| `/batch-jobs` | Batch Jobs | 批量任务列表 |
| `/batch-jobs/new` | Create Batch Job | 上传 JSONL + 配置参数 |
| `/batch-jobs/:id` | Batch Job Detail | 任务状态 + 结果下载 |

路由设计原则：
- Phase 1a/1b 的导航入口通过 **sidebar 链接**控制可见性，非对应 phase 的路径即便手动输入 URL 也返回 404。
- Mantine `AppShell` 的 `Navbar` 根据 phase 动态拼接 sidebar items，不需要路由守卫。
- URL 命名遵循 RESTful 资源风格：`/models/:id` 而非 `/model-detail?id=xxx`。

Phase 2 新增：

| 路径 | 页面 | 说明 |
|------|------|------|
| `/clusters` | Clusters | 集群列表与管理 |
| `/clusters/:id` | Cluster Detail | 节点列表、拓扑、最近告警 |
| `/clusters/:clusterId/nodes/:nodeId` | Node Detail | 每卡利用率、显存、进程、趋势图 |
| `/gpu-utilization` | GPU Utilization | 总览 + 按模型/租户 + 时间序列下钻 |
| `/cost-analytics` | Cost Analytics | 成本归因（5 维度拆分 + GPU 小时成本关联） |
| `/incidents` | Incidents | Incident 列表（严重度/状态/影响范围） |
| `/incidents/:id` | Incident Detail | 三栏布局：时间线 + 指标图表 + AI 助手面板 |
| `/settings/organization` | Organization Settings | 成员管理、预算配置（增强 RBAC） |
| `/settings/operations` | Operations Settings | Auto-Remediation 策略配置（见 §7.7.5） |
| `/settings/integrations` | Integrations | Slack 连接配置（见 §7.7.6） |

---

## 6. Phase 1 页面详细规格

### 6.1 Dashboard

#### 目标
让新用户 30 秒内发出第一个 API 请求；让老用户一眼看到用量和健康状态。

#### 页面区块

| 区块 | 优先级 | 说明 |
|------|--------|------|
| **Account status banner** | P0 | 未充值显示 "Make an initial deposit"；已充值显示余额/月度预算。 |
| **Developer Quickstart** | P0 | 可切换 Python / TypeScript / curl 的代码片段，默认模型为 Llama 3.1 8B Instruct。 |
| **Usage summary cards** | P0 | 今日 requests / tokens / 费用 / 剩余额度。 |
| **Quick actions** | P0 | Manage API keys / API reference / Explore models / Open Playground。 |
| **Recent activity** | P1 | 最近 10 次 API 调用：时间、模型、状态码、延迟、token 数。 |
| **Examples & Resources** | P1 | 4-6 个卡片：Build a chatbot / RAG app / Agent / Structured output。 |

#### 参考
Together AI Dashboard 截图：黄色 read-only banner、代码片段 + tab 切换、Examples & Resources 卡片网格。

---

### 6.2 Models

#### 目标
让用户快速发现模型、了解能力、看到价格，并一键进入 Playground 或查看 API 文档。

#### 页面结构

1. **Featured Models**（顶部横向卡片）
   - 展示 4 个主推模型：Llama 3.3 70B、DeepSeek V4 Pro、Qwen 2.5 72B、Llama 3.1 8B。
   - 每张卡片显示：模型名称、作者、capability tags、Serverless 价格、"Open in Playground" 按钮。

2. **Browse Models**（主表格）
   - 列：Model Name / Author / Category / Serverless Pricing / Batch Pricing / Status / Actions。
   - 操作：Open in Playground / View docs / Deploy custom model（入口，Phase 1 可跳转提示）。

3. **Filters**（左侧或顶部）
   - Deployment：Serverless / Dedicated。
   - Category：chat / embedding / image / audio / video / moderation。
   - Features：JSON Mode / Tool Calling / Multi-Modal / Fine-tuning。

#### 差异点
- 表格中预留「Avg Latency」/「GPU Utilization」列（Phase 2 填充数据）。
- 不显示 Together AI 式的 200+ 长列表。

---

### 6.3 Playground

#### 目标
零代码体验模型、调试参数、并生成可直接用于生产的代码。

#### 页面布局

```
┌──────────────────────────────────────┬─────────────────────┐
│  Header: Model selector + API view   │                     │
├──────────────────────────────────────┤   Settings Panel    │
│                                      │  (right, scrollable) │
│  Chat Area                           │                     │
│  - System Prompt                     │  - Max Tokens       │
│  - Messages (user/assistant)         │  - Temperature      │
│                                      │  - Top P            │
│                                      │  - Stop             │
│                                      │  - Penalties        │
│                                      │  - Response Format  │
│                                      │  - Tools (Phase 2)  │
├──────────────────────────────────────┤                     │
│  Input box + submit                  │                     │
└──────────────────────────────────────┴─────────────────────┘
```

#### 交互
- 顶部 Model dropdown 切换模型，切换时保留当前对话上下文。
- 「API view」按钮把当前对话配置生成 curl / Python / TypeScript 代码。
- Enter 发送，Shift+Enter 换行；支持 SSE 流式输出。
- 消息可重新编辑（点击已发送消息进入编辑态）、重新生成、复制。

#### 会话管理
- **多会话**：侧边栏或顶部 tabs 切换多个对话，每个对话独立上下文。
- **持久化**：Phase 1a 使用 localStorage（浏览器本地存储，清除缓存即丢失）。Phase 1b 迁移到后端存储，登录用户跨设备同步。
- **会话操作**：新建会话、重命名、删除、搜索历史对话。

#### 多模态支持
- 支持多模态的模型（如 Llama 3.2 Vision）时，输入框出现附件按钮，支持上传图片（拖拽/粘贴/文件选择）。
- 图片以缩略图形式嵌入消息气泡。

#### 错误与边界态
| 场景 | UI 反馈 |
|------|--------|
| 模型不可用 / 下线 | 顶部模型选择器标记为「Unavailable」，输入框 disabled，提示切换模型 |
| Rate limit（429） | 消息气泡显示红色错误提示 + 「Retry in N seconds」倒计时 |
| 输入超长（超过模型 context window） | 输入框下方显示黄色 token 计数警告：「Input exceeds model limit by N tokens」 |
| 网络错误 / 超时 | 流式输出中断处显示错误状态 + 「Retry」按钮 |
| SSE 断连 | 自动重连（最多 3 次），失败后显示「Connection lost. Retry?」 |

#### 参数面板
| 参数 | 默认值 | 说明 |
|------|--------|------|
| Max Tokens | 512 | 滑动条 + 数字输入 |
| Temperature | 0.7 | 滑动条 |
| Top P | 1.0 | 滑动条 |
| Stop | [] | 字符串数组输入 |
| Frequency Penalty | 0 | 滑动条 |
| Presence Penalty | 0 | 滑动条 |
| Response Format | Text | Dropdown：Text / JSON Object |
| Tools | - | Phase 2 支持 |

---

### 6.4 API Keys

#### 目标
安全、可审计地管理访问凭证。

#### 功能

| 功能 | 说明 |
|------|------|
| **Key list** | 名称、前缀（如 `ultr_...abc`）、创建人、创建时间、最后使用、角色、状态。 |
| **Create key** | 表单：名称、角色（Admin/Developer/Read-only）、可选模型白名单、可选月度额度上限。 |
| **Reveal secret** | 仅创建时显示完整 key，后续只显示前缀。 |
| **Revoke / Rotate** | 一键撤销；轮换流程生成新 key 并提示替换。 |
| **Usage by key** | 每个 key 的 requests / tokens / cost 汇总。 |

---

### 6.5 Endpoints

#### 目标
管理 Serverless 之外的预留/独享推理端点。

#### 功能

| 功能 | 说明 |
|------|------|
| **Endpoint list** | 名称、模型、类型（Serverless / Reserved / Dedicated）、状态、创建时间。 |
| **Create endpoint** | 选择模型、类型；Dedicated 需选择 GPU 规格和副本数。 |
| **Metrics mini** | QPS / TTFT p95 / TPOT / Error rate / GPU utilization。 |
| **Autoscaling policy** | Reserved/Dedicated 支持配置 min/max replicas。 |

---

### 6.6 Batch Jobs

#### 目标
异步批量推理入口。

#### 功能

| 功能 | 说明 |
|------|------|
| **Job list** | 名称、模型、状态（pending/running/completed/failed）、提交时间、完成时间、tokens、折扣后费用。 |
| **Create job** | 上传 JSONL 文件、选择模型、配置回调 URL、选择输出格式。 |
| **Result download** | 完成后下载结果 JSONL。 |
| **Error log** | failed 任务展示失败样本。 |

---

### 6.7 Billing（Phase 1 基础版）

#### 目标
清晰的用量和费用。

#### 功能

| 功能 | 说明 |
|------|------|
| **Balance** | 当前余额、充值入口、自动充值开关。 |
| **Invoices** | 历史账单列表，支持下载。 |
| **Usage by model** | 饼图 / 柱状图，时间范围可选。 |
| **Usage by API key** | 按 key 拆分的用量表。 |
| **Time range** | 今天 / 7 天 / 30 天 / 自定义。 |

---

## 7. Phase 2：Operations 模块

Phase 2 在左侧导航增加「Operations」，把 Chamber 式能力原生集成进控制台。

### 7.1 Clusters

| 功能 | 说明 |
|------|------|
| **Cluster list** | 名称、区域、GPU 类型、节点数、健康状态、平均 GPU 利用率。 |
| **Cluster detail** | 节点列表、网络拓扑、InfiniBand/RDMA 状态、最近告警。 |

### 7.2 Nodes

| 功能 | 说明 |
|------|------|
| **Node list** | 主机名、GPU 型号、GPU 数量、显存使用率、温度、驱动/CUDA 版本。 |
| **Node detail** | 每卡利用率、显存、运行进程、历史趋势图。 |

### 7.3 Deployments

| 功能 | 说明 |
|------|------|
| **Deployment list** | 模型、关联 endpoint、副本数、GPU 分配、状态。 |
| **Scale / Rollback** | 手动扩缩容、版本回滚。 |
| **Logs** | 推理服务日志入口。 |

### 7.4 GPU Utilization（核心差异页）

| 功能 | 说明 |
|------|------|
| **Overview** | 总 GPU 数 / 平均利用率 / 空闲 GPU 数 / 排队请求数。 |
| **Per-model** | 每个模型占用的 GPU 和利用率。 |
| **Per-tenant** | 多租户下各团队的使用情况。 |
| **Time-series** | Prometheus/Grafana 风格图表，支持多维度下钻。 |

### 7.5 Cost Analytics（Phase 2 增强版）

> **与 Phase 1 Billing 的关系**：Phase 1 的 Organization → Billing 回答「花了多少钱」，提供余额、账单、按模型/Key 的用量图表。Phase 2 的 Operations → Cost Analytics 是独立页面，回答「钱花在哪里、为什么」，面向需要做成本归因的 ML/Platform 团队。两个页面共存，各有侧重。

| 功能 | 说明 |
|------|------|
| **Cost attribution** | 按模型 / endpoint / API key / 团队 / 项目拆分。 |
| **GPU-hour cost** | 把 token 费用和 GPU 时间成本关联。 |
| **Budget & alerts** | 设置月度预算，超阈值通过邮件/Slack 告警。可配置告警维度（token 量、费用、GPU 利用率），支持告警抑制（连续超过阈值 N 分钟才触发，避免抖动）。 |

### 7.6 Model Shaping（Phase 2+）

- Fine-tuning Jobs：创建、监控、评估任务。
- Evaluations：标准 benchmark 和自定义评估。

### 7.7 AI-Assisted Diagnostics（Phase 2 核心差异化）

> **定位**：对标 Chamber Chambie 智能体。与 Chambie 不同的是，Ultralisk 的 AI 运维助手**运行在自己的推理平台上**——用 Llama 3.3 70B 或 DeepSeek V4 Pro 做根因分析和对话。客户看到的不仅是一个运维工具，更是 Ultralisk 推理能力的现场演示。
>
> **架构**：异常检测用 Prometheus 规则（实时、确定性、零延迟），根因分析和对话用 LLM（智能、泛化、可解释）。两者分工，各取所长。

#### 7.7.1 异常检测（规则引擎）

Prometheus 告警规则负责实时检测，以下为初始规则集：

| 检测类型 | 触发条件 | 严重度 |
|---------|------------|--------|
| GPU 利用率骤降 | 单节点利用率 10 分钟内下降 >40% | 🔴 Critical |
| 推理延迟飙升 | TTFT p95 超过基线 3x 持续 5 分钟 | 🔴 Critical |
| 错误率激增 | 5xx 错误率 >5% 持续 2 分钟 | 🔴 Critical |
| OOM Kill | 检测到 vLLM worker 被 OOM kill | 🔴 Critical |
| 温度过高 | GPU 温度 >85°C 持续 10 分钟 | 🟡 Warning |
| 节点离线 | 节点心跳丢失 >60s | 🔴 Critical |
| 显存泄漏 | 显存使用率 24h 内单调增长 >20% | 🟡 Warning |
| 排队积压 | 请求队列 >100 持续 5 分钟 | 🟡 Warning |

告警触发后自动创建 Incident，同时触发 AI 分析（见下节）。

#### 7.7.2 AI 根因分析（LLM）

Incident 创建后，系统自动调用 Ultralisk 推理 API 进行根因分析。

**输入**：系统将以下结构化上下文组装为 prompt 发送给模型：

```typescript
interface AnalysisContext {
  incident: {
    type: string;          // e.g. "gpu_utilization_drop"
    severity: string;
    detected_at: string;
    affected_entities: { cluster_id, node_id, model_id?, endpoint_id? };
  };
  metrics_snapshot: {
    window: { from: string; to: string };  // 异常点前后 30 分钟
    gpu_utilization: TimeSeries[];
    memory_usage: TimeSeries[];
    temperature: TimeSeries[];
    request_latency: TimeSeries[];
    error_rate: TimeSeries[];
  };
  system_events: {
    timestamp: string;
    source: string;        // e.g. "kernel", "nvidia-smi", "vllm"
    message: string;
  }[];
  recent_changes: {
    timestamp: string;
    type: string;          // e.g. "deployment", "scale", "config_change"
    summary: string;
  }[];
}
```

**推理**：发送到 `POST /v1/chat/completions`（Ultralisk 自己的端点），使用 Llama 3.3 70B Instruct 或 DeepSeek V4 Pro，搭配结构化 system prompt。每次分析约 2K input + 500 output tokens，成本 ~$0.003。

**输出**：模型返回结构化 JSON——根因按可能性排序，每条附带置信度、证据引用、推荐操作和风险评级：

```
示例输出：Incident #142 — GPU 利用率骤降

节点：gpu-n12 (H100 × 8)
异常：GPU 利用率从 72% → 18%（14:32 UTC）

AI 分析结果：

1. ⚠️ OOM Kill（置信度 92%）
   证据：vllm-worker-3 进程在 14:32:05 退出（exit code 137=SIGKILL）
        节点显存在 14:31:58 达到峰值 79.2/80 GB
   推荐操作：重启 vllm-worker-3 | 风险：低（节点当前无生产流量）
   长期建议：增大 `--max-model-len` 从 8192 → 4096，或启用 `--enforce-eager`

2. 🔍 驱动崩溃（置信度 45%）
   证据：nvidia-smi 在 14:32:10 报告 "Unknown Error"
         — 但这可能是 OOM Kill 的副作用，非根因
   推荐操作：复查 dmesg 中的 Xid 错误码 | 风险：中

3. 💡 温控降频（置信度 12%）
   证据：GPU 2 温度在 14:28 达 87°C
         — 但该节点仅 GPU 2 受影响，无法解释 8 卡全部骤降
   推荐操作：检查机房散热 | 风险：无
```

#### 7.7.3 AI 运维助手（对话式）

Incident 详情页内嵌 AI 助手面板。用户可以用自然语言追问。

**交互方式**：
- 面板默认折叠在详情页右侧，点击展开
- 上下文预加载：当前 Incident 的全部结构化数据 + 首次 AI 分析结果，作为对话的 system context
- 用户可以追问：「这和昨天的 incident #138 是同一个原因吗？」「如果降级到 FP8 量化能缓解显存压力吗？」「建议的配置变更对吞吐量影响有多大？」
- 模型可以请求额外数据（如「查看该节点过去 7 天的显存趋势」），系统通过 function calling 查询 Prometheus 后追加到上下文

**技术实现**：
- 调用 Ultralisk 自己的 `/v1/chat/completions` 端点
- 使用 Llama 3.3 70B Instruct（支持 function calling）
- 对话历史持久化到 Incident 记录中，关闭 Incident 后对话存档
- 平均每次追问成本 ~$0.005（3K in + 800 out tokens）

#### 7.7.4 为什么用 LLM 而不是规则

| 维度 | 规则引擎 | LLM（采用） |
|------|---------|------------|
| 维护成本 | 每新增一种故障模式需手写规则 | 零——模型自动泛化 |
| 覆盖范围 | 只检测已知模式 | 能处理训练数据之外的故障 |
| 解释质量 | 固定模板 | 自然语言解释，有逻辑链 |
| 单次成本 | 免费 | ~$0.003（运行在 Ultralisk 自有 GPU，边际成本接近零） |
| 产品演示 | 无 | **客户亲眼看到 Ultralisk 推理 API 驱动运维** |

#### 7.7.5 分级自动修复（Tiered Auto-Remediation）

> Chamber Chambie 支持部分自动修复。Ultralisk 不推迟到 Phase 2+——Phase 2 提供三级修复策略，用户按风险承受度配置自动化程度。

**三级修复策略**：

| 级别 | 触发方式 | 适用场景 | 默认策略 |
|------|---------|---------|---------|
| **Tier 1 — 自动** | AI 推荐 → 系统自动执行（用户可关闭） | 低风险、无副作用、已验证的操作 | 默认开启 |
| **Tier 2 — 半自动** | AI 推荐 → 用户一键批准执行（Web 或 Slack） | 中风险、需要人工判断 | 需用户确认 |
| **Tier 3 — 手动** | AI 推荐 → 显示操作步骤，用户自行执行 | 高风险、需要深度运维判断 | 仅建议 |

**各层操作示例**：

| 操作 | 级别 | 理由 | 预计恢复时间 |
|------|------|------|------------|
| 重启崩溃的 vLLM worker | Tier 1 | 单 worker 重启不影响其他 worker，无数据丢失 | < 10s |
| GPU 显存清理（nvidia-smi -r） | Tier 1 | 检测到显存泄漏且无活跃请求时安全 | < 5s |
| 从 LB 摘除过热节点 | Tier 1 | 仅影响流量路由，不改变节点状态 | 即时 |
| 扩容副本（应对排队积压） | Tier 2 | 需要冷启动时间，涉及成本增加 | 30s-2min |
| 回滚部署到上一版本 | Tier 2 | 涉及服务中断，需确认影响范围 | 30s-1min |
| 模型迁移到其他节点 | Tier 2 | 涉及模型加载，需确认目标节点有足够显存 | 30s-2min |
| 节点重启 | Tier 3 | 影响该节点所有工作负载 | 3-5min |
| 集群级配置变更 | Tier 3 | 影响整个集群，需 Infra 团队评估 | 视变更而定 |
| GPU 驱动更新/回滚 | Tier 3 | 需要节点排空 + 重启，高风险 | 10-30min |

**用户配置界面**（Settings → Operations → Auto-Remediation）：

```
┌─────────────────────────────────────────────────────────┐
│  Auto-Remediation Policy                               │
│                                                         │
│  Tier 1 — Automatic                                    │
│  [ ✓ ] Restart crashed vLLM worker                     │
│  [ ✓ ] Clear GPU memory (when no active requests)      │
│  [ ✓ ] Drain overheated node from LB                   │
│                                                         │
│  Tier 2 — Semi-automatic (require approval)            │
│  [ ✓ ] Scale up replicas                               │
│  [ ✓ ] Roll back deployment                            │
│  [ ✓ ] Migrate model to different node                 │
│  Approval channel:  [ ✓ ] Web  [   ] Slack  [ ✓ ] Email│
│                                                         │
│  Tier 3 — Manual (recommendation only)                 │
│  [ ✓ ] Node reboot                                     │
│  [ ✓ ] Cluster config change                           │
│  [ ✓ ] GPU driver update                               │
│                                                         │
│  Auto-suppression:                                      │
│  [ ✓ ] Suppress duplicate alerts within [ 24h ▼ ]     │
└─────────────────────────────────────────────────────────┘
```

#### 7.7.6 ChatOps 集成（Slack）

> Chamber 的 Chambie 通过 Slack 交互是其核心体验。Ultralisk Phase 2 不推迟到 Phase 3——直接在 Phase 2 提供 Slack 集成，复用同一套 AI 助手后端。

**Slack 集成能力**：

| 功能 | 触发方式 | 说明 |
|------|---------|------|
| **Incident 通知** | 自动推送 | Critical/Warning Incident 创建时推送到指定 Slack 频道。消息包含：严重度、影响范围、AI 分析摘要（首条根因 + 置信度） |
| **AI 分析摘要** | 自动推送 | 作为 Incident 通知的 thread reply，AI 自动生成 TL;DR：「节点 gpu-n12 GPU 利用率骤降，最可能原因：OOM Kill（置信度 92%）。建议重启 vllm-worker-3。」 |
| **状态查询** | `/ultralisk incident 142` | 查询 Incident 当前状态、AI 分析结果、操作记录 |
| **对话式运维** | `/ultralisk ask <问题>` | 直接向 AI 助手提问，上下文自动关联最近相关 Incident。例：`/ultralisk ask 过去 24 小时哪些节点的 OOM 频率最高？` |
| **批准操作** | 交互按钮 | Tier 2 操作推送到 Slack 时附带「Approve & Execute」按钮，运维无需打开 Web 即可批准 |
| **操作确认** | 自动推送 | 任何操作（自动或手动）执行后在 thread 中推送结果：「vllm-worker-3 已重启 ✅ GPU 利用率恢复至 68%（14:38 UTC）」 |

**技术实现**：
- Slack Bolt SDK（Node.js）+ Socket Mode（无需公网 HTTP endpoint）
- 对话式运维的查询复用 §7.7.3 的同一 AI 助手后端——Slack 消息格式化后以相同 prompt 结构发给 Ultralisk 推理 API
- Incident 上下文通过 `incident_id` 关联，Slack 侧不存储对话历史，每次查询携带必要上下文
- 命令权限：仅限组织内已关联 Slack 账号的成员

#### 7.7.7 Incident 生命周期

```
[Prometheus 告警触发] → [Incident 自动创建] → [AI 自动分析]
                                                    ↓
                                              open ← AI 分析结果已就绪
                                                ↓
                                          investigating（运维接手）
                                                ↓
                                            mitigated（修复已执行）
                                                ↓
                                            resolved（指标恢复 10 分钟后自动关闭）

特殊情况：
  suppressed：用户标记为误报，24h 同类抑制
```

#### 7.7.8 Incidents 页面

| 功能 | 说明 |
|------|------|
| **列表视图** | Incident 列表：严重度标签、状态、触发时间、影响范围、持续时长、AI 分析状态（analyzing / ready） |
| **筛选** | 按严重度、状态、集群、时间范围 |
| **详情视图** | 三栏布局：左侧时间线（事件 + 操作记录），中间指标图表（Grafana 嵌入，异常点高亮），右侧 AI 助手面板 |
| **操作按钮** | Investigate / Mitigated / Resolved / Suppress。Tier 2 操作用「Approve & Execute」按钮，点击后显示确认弹窗（操作摘要 + 风险提示 + 预计恢复时间）。Tier 3 操作用「View Instructions」按钮，展开手动操作步骤。 |
| **AI 面板** | 自动分析结果（首次）+ 对话输入框（追问）。每次追问记录到 Incident action_log。 |

#### 7.7.9 模型选择与降级策略

| 场景 | 使用的模型 | 原因 |
|------|----------|------|
| 日常分析 | Llama 3.3 70B Instruct | 成本最低，能力足够 |
| 复杂故障（多节点、跨集群） | DeepSeek V4 Pro | 长上下文 + 更强推理 |
| 模型不可用时 | 回退到基础规则匹配 | 保证 Incident 不丢分析结果 |

#### 7.7.10 与 Chamber Chambie 的对比

| 能力 | Chamber Chambie | Ultralisk Phase 2 | 差异 |
|------|----------------|-------------------|------|
| 自动异常检测 | ✅ | ✅ Prometheus 规则 | 持平 |
| 根因分析 | ✅ LLM（外部模型） | ✅ LLM（**Ultralisk 自有推理**） | **领先——dogfooding** |
| 推荐操作 | ✅ | ✅ LLM 生成 + 风险评级 | 持平 |
| 分级自动修复 | ✅ 部分自动 | ✅ **Tier 1 自动 / Tier 2 半自动 / Tier 3 手动**，用户可配策略 | **领先——策略可配置，Chambie 粒度不明** |
| 对话式运维 | ✅ Slack 机器人 | ✅ **Web 内嵌 AI 助手 + Slack ChatOps**（`/ultralisk ask`） | 持平——双渠道覆盖 |
| Slack Incident 通知 | ✅ | ✅ 自动推送 + AI 摘要 + 交互按钮批准操作 | 持平 |
| 知识跨 Incident 复用 | ✅ RAG | ⬜ Phase 2 开始积累 → Phase 2+ RAG | 规划中 |
| 运维知识可审计 | ❓ 黑盒 | ✅ 每次分析的 prompt 和 response 完整存档 | **领先** |
| 外部依赖 | 依赖第三方 LLM API | **零外部依赖**（运行在自己 GPU 上） | **领先——私有化场景关键技术壁垒** |

> **关键差异化**：Chambie 调用的是外部 LLM API。Ultralisk 的 AI 助手跑在自己的推理平台上。对 SaaS 客户，这是「用 Ultralisk 推理驱动 Ultralisk 运维」的信任证明；对私有化客户，这意味着**不需要外网 LLM API 也能使用 AI 运维**——Chamber 的私有化方案做不到这点。Chambie 的自动修复和 Slack 集成不再是 Ultralisk 的缺口——Phase 2 已全部覆盖。

---

## 8. Phase 3：私有化部署控制台

### 8.1 架构形态

| 形态 | 部署位置 | 用户 |
|------|---------|------|
| **SaaS Console** | Ultralisk 托管 | 公有云 API 客户 |
| **Private Console** | 客户数据中心 | 企业私有化客户 |

### 8.2 私有化专属功能

| 功能 | 说明 |
|------|------|
| **Setup Wizard** | 引导完成 K8s 接入、存储配置、GPU 节点注册、License 激活。 |
| **Offline Model Registry** | 导入 HuggingFace / 本地模型，不依赖外网。 |
| **Audit Logs** | 用户操作、API 调用、模型部署全量审计，支持导出。 |
| **RBAC + SSO** | 与企业 SSO/SAML 集成，细粒度角色与权限。 |
| **Compliance** | SOC2 / ISO27001 状态展示、数据保留策略。 |
| **License & Support** | 显示软件许可、授权 GPU 数量、支持合约。 |

---

## 9. 数据模型（核心实体）

```
User
├── id, email, name, avatar, role, created_at
└── Organizations[]

Organization
├── id, name, billing_email, plan, balance, budget_alert
├── Members[] (User + org_role)
├── Projects[]
└── BillingRecords[]

Project
├── id, org_id, name
├── ApiKeys[]
└── CostAllocations[]

ApiKey
├── id, project_id, name, prefix, hashed_secret, role
├── model_allowlist, monthly_quota, usage_month_to_date
├── created_at, last_used_at, revoked_at

Model
├── id, name, display_name, author, category
├── modalities, features, pricing
├── status, version
└── Endpoints[]

Endpoint
├── id, model_id, project_id, name, type
├── replicas, gpu_spec, autoscaling_policy
├── status, created_at
└── Metric[] (see Metric entity below)

BatchJob
├── id, project_id, endpoint_id?, name, status
├── endpoint_id 仅在预留/独享 endpoint 场景有值，Serverless batch 为 null
├── input_file, output_file, callback_url
├── token_count, cost, created_at, completed_at

Metric
├── id, entity_type (Endpoint | GpuCard | Cluster), entity_id
├── metric_name (qps | ttft_p95 | tpot | error_rate | gpu_util | mem_used | temperature)
├── value (float), timestamp
└── labels (optional key-value tags for multi-dimension queries)

Cluster (Phase 2)
├── id, name, region, gpu_type, node_count, status
└── Nodes[]

Node (Phase 2)
├── id, cluster_id, hostname, gpu_model, gpu_count
├── driver_version, cuda_version, status
└── GpuCards[]

GpuCard
├── id, node_id, index, utilization_percent, memory_used, memory_total
├── temperature, processes[]
└── Metric[] (see Metric entity above)

Incident (Phase 2)
├── id, severity (critical | warning | info)
├── status (open | investigating | mitigated | resolved | suppressed)
├── title, description (auto-generated from detection rule)
├── detection_type (gpu_drop | latency_spike | error_surge | oom_kill | thermal_throttle | node_offline | memory_leak | queue_backlog)
├── affected_entities[] (cluster_id, node_id, model_id, endpoint_id — 至少一个)
├── analysis_context (AnalysisContext — 发给 LLM 的结构化快照，见 §7.7.2)
├── ai_analysis: {
│     model_used: string,          // e.g. "llama-3.3-70b-instruct"
│     completed_at: string,
│     root_causes: { cause: string, confidence: float, evidence: string }[],
│     recommendations: { action: string, risk: low|medium|high, description: string }[],
│     prompt_snapshot: string,     // 完整 prompt（可审计）
│     response_raw: string         // 完整 LLM 返回（可审计）
│   }
├── conversation_history[] (timestamp, role: user|assistant, content: string — AI 助手追问记录)
├── action_log[] (timestamp, user_id, action: string, result: string)
├── triggered_at, mitigated_at, resolved_at, suppressed_at
└── related_metric_snapshot (异常触发时刻前后 30min 的关键指标快照，供详情页图表渲染)

Alert (Phase 2)
├── id, incident_id (nullable — 关联后升级为 Incident)
├── name, description, severity
├── source_metric (Prometheus query or event source)
├── condition (threshold, duration, comparison operator)
├── status (firing | resolved | suppressed)
├── fired_at, resolved_at
└── notification_channels[] (email | slack | webhook)
```

---

## 10. API 契约（Console ↔ Backend）

### 10.1 通用约定

- **Console 管理 API 认证**：OAuth 2.0 + JWT（Bearer token），通过 `Authorization: Bearer <jwt>` 传递。Console 前端在用户登录后获取 JWT，与推理 API Key 的认证体系**完全独立**。
- **推理 API 认证**：HTTP Header `Authorization: Bearer <api-key>`，用于 `/v1/chat/completions`、`/v1/completions`、`/v1/embeddings` 等推理端点。
- 内容类型：`application/json`。
- 分页：`?page=&limit=`，返回 `{ data, pagination: { page, limit, total } }`。
- 错误格式：`{ error: { code, message, details } }`。
- 管理 API 统一前缀 `/v1/admin/`，推理 API 保持 `/v1/`（OpenAI 兼容路径不变）。

### 10.2 核心端点

#### 推理 API（OpenAI 兼容，API Key 认证）

| 端点 | 说明 |
|------|------|
| `POST /v1/chat/completions` | 聊天补全 |
| `POST /v1/completions` | 文本补全 |
| `POST /v1/embeddings` | Embedding |

#### 管理 API（Console 前端调用，JWT 认证）

**认证**

| 端点 | 说明 |
|------|------|
| `POST /v1/admin/auth/accept-invitation` | 接受邀请：提供 `token` + `password`，返回 JWT |
| `POST /v1/admin/auth/login` | 邮箱 + 密码登录，返回 JWT |
| `POST /v1/admin/auth/logout` | 登出，服务端废除 JWT |
| `GET /v1/admin/auth/me` | 当前登录用户信息 |
| `POST /v1/admin/invitations` | 管理员创建邀请链接（Phase 1a） |
| `GET /v1/admin/invitations` | 列出待接受/已使用的邀请 |

**数据**

| 端点 | 说明 |
|------|------|
| `GET /v1/admin/models` | 模型目录 |
| `GET /v1/admin/models/:id` | 模型详情 |
| `GET /v1/admin/usage` | 用量统计 |
| `GET /v1/admin/billing` | 账单与余额 |
| `GET /v1/admin/api-keys` | API Key 列表 |
| `POST /v1/admin/api-keys` | 创建 API Key（响应含完整 secret） |
| `DELETE /v1/admin/api-keys/:id` | 删除/撤销 API Key |
| `PATCH /v1/admin/api-keys/:id` | 更新 API Key（角色、限额等） |
| `GET /v1/admin/endpoints` | 端点列表 |
| `POST /v1/admin/endpoints` | 创建端点 |
| `PATCH /v1/admin/endpoints/:id` | 更新端点（扩缩容、配置） |
| `DELETE /v1/admin/endpoints/:id` | 删除端点 |
| `GET /v1/admin/batch-jobs` | Batch 任务列表 |
| `POST /v1/admin/batch-jobs` | 创建 Batch 任务 |
| `DELETE /v1/admin/batch-jobs/:id` | 取消 Batch 任务 |
| `GET /v1/admin/clusters` | 集群列表（Phase 2） |
| `GET /v1/admin/nodes` | 节点列表（Phase 2） |
| `GET /v1/admin/gpu-utilization` | GPU 利用率（Phase 2） |
| `GET /v1/admin/cost-analytics` | 成本归因（Phase 2） |
| `GET /v1/admin/incidents` | Incident 列表（Phase 2） |
| `GET /v1/admin/incidents/:id` | Incident 详情（时间线 + AI 分析结果 + 操作记录） |
| `PATCH /v1/admin/incidents/:id` | 更新 Incident 状态（investigating/mitigated/resolved/suppressed） |
| `POST /v1/admin/incidents/:id/actions` | 记录执行的操作（追加到 action_log） |
| `GET /v1/admin/alerts` | 活跃告警列表（Phase 2） |
| `POST /v1/admin/alerts/:id/suppress` | 抑制告警（24h 内同类不重复触发） |

### 10.3 实时数据

- GPU 监控通过 Server-Sent Events 或 WebSocket 推送。
- Playground 流式输出使用 SSE。

### 10.4 Response Schema（Phase 1a）

> 以下为 Console 管理和推理 API 的 JSON 返回结构。所有管理 API 返回体均包裹在 `{ data, pagination? }` 中；推理 API 遵循 OpenAI 兼容格式。
>
> Phase 1b（Endpoints、Batch Jobs）和 Phase 2（Clusters、Nodes、GPU Utilization、Cost Analytics、Incidents）的 response schema 在各 Phase 启动实现前补充——基本遵循同名数据模型实体的字段结构（见 §9）。

#### 10.4.1 通用结构

```typescript
// 分页列表响应（管理 API）
interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;    // 当前页码，从 1 开始
    limit: number;   // 每页条数
    total: number;   // 总记录数
  };
}

// 单条记录响应
interface SingleResponse<T> {
  data: T;
}

// 错误响应
interface ErrorResponse {
  error: {
    code: string;       // e.g. "unauthorized", "not_found", "rate_limited"
    message: string;    // 人类可读描述
    details?: unknown;  // 可选的结构化详情（字段校验错误等）
  };
}
```

#### 10.4.2 Auth

**`POST /v1/admin/auth/accept-invitation`**

```typescript
// Request
{ token: string; password: string; }

// Response: SingleResponse<{ user: User; jwt: string; }>
```

**`POST /v1/admin/auth/login`**

```typescript
// Request
{ email: string; password: string; }

// Response: SingleResponse<{ user: User; jwt: string; }>
```

**`GET /v1/admin/auth/me`**

```typescript
// Response: SingleResponse<User>

interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: "admin" | "developer" | "readonly";
  org_id: string;
  org_name: string;
  created_at: string;  // ISO 8601
}
```

#### 10.4.3 Models

**`GET /v1/admin/models?category=chat&deployment=serverless`**

```typescript
// Response: PaginatedResponse<Model>

interface Model {
  id: string;                  // e.g. "llama-3.3-70b-instruct"
  display_name: string;        // e.g. "Llama 3.3 70B Instruct"
  author: string;              // e.g. "Meta"
  category: "chat" | "embedding" | "image" | "audio" | "video" | "moderation";
  description: string;
  capabilities: {
    context_window: number;    // e.g. 131072
    max_output_tokens: number; // e.g. 4096
    json_mode: boolean;
    tool_calling: boolean;
    multi_modal: boolean;      // 是否支持图片/音频输入
    fine_tuning: boolean;      // Phase 2
  };
  pricing: {
    serverless: {
      input_per_1m_tokens: number;   // USD
      output_per_1m_tokens: number;  // USD
      cached_input_per_1m_tokens?: number;
    };
    batch_discount_percent?: number; // e.g. 50 → 50% off
    dedicated?: {                    // Phase 1b
      gpu_type: string;
      price_per_hour: number;
    };
  };
  deployment_types: ("serverless" | "dedicated")[];
  status: "available" | "degraded" | "unavailable";
  version: string;             // e.g. "fp8-quantized"
  featured: boolean;           // 是否展示在 Featured Models 卡片区
  created_at: string;
}
```

**`GET /v1/admin/models/:id`** — 返回同上 `SingleResponse<Model>`，额外包含 `usage_examples` 字段：

```typescript
interface ModelDetail extends Model {
  usage_examples: {
    curl: string;
    python: string;
    typescript: string;
  };
}
```

#### 10.4.4 Usage

**`GET /v1/admin/usage?range=today`**

```typescript
// Response: SingleResponse<UsageSummary>

interface UsageSummary {
  period: {
    from: string;  // ISO 8601
    to: string;
  };
  totals: {
    requests: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  };
  by_model: {
    model_id: string;
    model_display_name: string;
    requests: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  }[];
  by_key: {
    key_id: string;
    key_name: string;
    key_prefix: string;  // e.g. "ultr_...abc"
    requests: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  }[];
  recent_activity: {      // 最近 10 条 API 调用
    timestamp: string;
    model_id: string;
    status_code: number;
    latency_ms: number;
    tokens: number;
  }[];
}
```

#### 10.4.5 Billing

**`GET /v1/admin/billing`**

```typescript
// Response: SingleResponse<Billing>

interface Billing {
  balance_usd: number;          // 当前余额
  monthly_budget_usd: number | null;  // 月度预算上限，未设置则为 null
  month_to_date_spend_usd: number;
  estimated_month_end_usd: number;
  auto_recharge_enabled: boolean;
  invoices: {
    id: string;
    period: string;             // e.g. "2026-07"
    amount_usd: number;
    status: "paid" | "pending" | "overdue";
    download_url: string;
    issued_at: string;
  }[];
}
```

#### 10.4.6 API Keys

**`GET /v1/admin/api-keys`**

```typescript
// Response: PaginatedResponse<ApiKey>

interface ApiKey {
  id: string;
  name: string;
  prefix: string;           // e.g. "ultr_...abc"
  role: "admin" | "developer" | "readonly";
  model_allowlist: string[] | null;  // null = 所有模型可用
  monthly_quota_usd: number | null;
  usage_this_month_usd: number;
  created_by: string;       // 创建者 name
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  status: "active" | "revoked";
}
```

**`POST /v1/admin/api-keys`**

```typescript
// Request
{
  name: string;
  role: "admin" | "developer" | "readonly";
  model_allowlist?: string[];
  monthly_quota_usd?: number;
}

// Response: ApiKey（同上结构 + secret 字段）
// ⚠️ secret 仅在创建响应中返回，后续任何 API 不再暴露完整 key
interface ApiKeyCreated extends ApiKey {
  secret: string;  // 完整 key，仅此一次
}
```

#### 10.4.7 Chat Completions（推理 API）

**`POST /v1/chat/completions`** — 完全兼容 OpenAI 格式：

```typescript
// Request
{
  model: string;           // e.g. "llama-3.3-70b-instruct"
  messages: {
    role: "system" | "user" | "assistant";
    content: string | ContentPart[];
  }[];
  max_tokens?: number;     // default 512
  temperature?: number;    // default 0.7
  top_p?: number;          // default 1.0
  stop?: string[];
  frequency_penalty?: number;
  presence_penalty?: number;
  response_format?: { type: "text" | "json_object" };
  stream?: boolean;        // default false
}

// ContentPart (多模态)
interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string; detail?: "auto" | "low" | "high" };
}

// Response (非流式)
{
  id: string;
  object: "chat.completion";
  created: number;         // Unix timestamp
  model: string;
  choices: {
    index: number;
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: "stop" | "length" | "content_filter";
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Response (流式 SSE)
// data: {"id":"...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}
// ...
// data: {"id":"...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}
// data: [DONE]
```

---

## 11. 非功能需求

| 类别 | 要求 |
|------|------|
| **性能** | 页面首屏加载 < 2s（非控制台首次加载）；API 列表 < 500ms。 |
| **可用性（Availability）** | Console 前端 SLA 目标 99.9%（不含计划维护）；Backend 管理 API SLA 99.95%；故障恢复时间（RTO）< 1h。 |
| **用户体验** | 支持 light / dark / system theme；响应式布局，桌面端优先（≥1280px 最佳体验），移动端提供基础浏览能力（≥375px）。 |
| **浏览器兼容** | 支持 Chrome/Firefox/Safari/Edge 最近 2 个主版本；不支持 IE。 |
| **安全** | API key 仅创建时可见（仅创建响应返回完整 key，后续仅显示前缀）；以下敏感操作需二次确认弹窗：删除 API Key、撤销 Key、删除 Endpoint、删除组织、删除成员。RBAC 从 Phase 1 起预留。 |
| **国际化** | 架构预留 i18n；Phase 1 英文优先。 |
| **可访问性** | 符合 WCAG 2.1 AA 基本要求。 |
| **私有化** | Console 与 Backend API 解耦，支持独立部署包。 |

---

## 12. 技术选型

| 决策 | 选型 | 说明 |
|------|------|------|
| 前端框架 | React 19.2+ + TypeScript | Mantine v9 要求 React ≥19.2 |
| 组件库 | **Mantine v9** | 100+ 组件，原生 CSS Modules/CSS Variables（无运行时），内置 dark mode、form、hooks、通知系统。Table 组件支持排序/筛选/选择，适合数据密集型页面。 |
| 图表 | `@mantine/charts`（基于 Recharts） | 与 Mantine 主题系统整合，CompositeChart 覆盖 GPU 利用率看板等复合图表需求。 |
| 服务端状态 | `@tanstack/react-query` | API 缓存、自动重取、分页、SSE 集成。 |
| 客户端状态 | React Context + `use-local-storage` | Phase 1a 状态足够简单，不需要 Zustand。后续需要时再引入。 |
| 表单 | `@mantine/form` | 与 Mantine 组件原生集成，支持验证 schema。 |
| 实时数据 | SSE / WebSocket | Playground 流式输出（SSE），GPU 监控推送（WebSocket）。 |
| 构建工具 | Vite | Mantine 官方支持，HMR 极快。 |
| CSS | Mantine CSS Modules + PostCSS | Mantine v7+ 已移除 Emotion，使用原生 CSS。 |

---

## 13. 成功指标

| 指标 | 目标 |
|------|------|
| Time to first API call | 新用户注册后 < 5 分钟 |
| Playground → API key 转化率 | > 30% |
| 控制台 DAU/WAU | 持续增长 |
| Operations 页面访问占比 | Phase 2 后 > 20%（运营用户） |
| 私有化交付周期 | 签约到控制台可用 < 2 周 |

---

## 14. 交付路线

| 阶段 | 周期 | 控制台重点 |
|------|------|-----------|
| **Phase 1a**（MVP） | 4-6 周 | Dashboard、Models、Playground、API Keys、Billing（基础版）。目标：2 个模型，新用户 5 分钟内发出第一个 API 请求。 |
| **Phase 1b**（增强） | 6-12 周 | Endpoints（预留/独享）、Batch Jobs、Billing 增强（历史账单、时间范围筛选）。 |
| **Phase 2** | 3-6 月 | Operations 模块（Clusters、Nodes、Deployments、GPU Utilization、Cost Analytics、Incidents / AI-Assisted Diagnostics）、多租户、增强 RBAC。 |
| **Phase 3** | 6-12 月 | 私有化控制台、Setup Wizard、Audit Logs、SSO、合规视图。 |

---

## 15. 开放问题

1. ~~是否需要在 Phase 1 支持 dark mode？~~ ✅ **Phase 1 支持。** Mantine v9 内置 dark mode（CSS 变量方案），初始值跟随 `prefers-color-scheme`，用户可在设置切换。
2. ~~前端组件库选择~~ ✅ **Mantine v9**。React 19.2 原生 CSS，内置 charts/form/hooks/notifications。
3. ~~Phase 1 注册模式~~ ✅ **Phase 1a invitation-only**。管理员手动发送邀请链接，用户设密码即完成注册。Phase 1b 视情况开放自助注册。
4. ~~私有化控制台代码复用~~ ✅ **Monorepo 复用**。`@ultralisk/console-ui` + `@ultralisk/console-api` 在同一 monorepo（turborepo），SaaS 与私有化的差异通过 feature flags + 环境变量控制，不分叉代码。
5. ~~控制台内置文档站点~~ ✅ **外链独立 docs**。控制台内仅保留 Quickstart 代码片段 + 指向 docs.ultralisk.com 的链接。
6. ~~Playground 对话持久化策略~~ ✅ **Phase 1a localStorage，Phase 1b 迁后端。** Phase 1a 不建 sessions 表，不建会话 API。对话保存在浏览器本地，清除缓存即丢失。用户登录后 Phase 1b 迁移到服务端存储，支持跨设备同步。

---

## 16. 附录：参考截图要点

### together-dashboard.png
- 顶部黄色 read-only banner（未充值提示）。
- Developer Quickstart 代码片段，支持 Python / TypeScript / curl tab 切换。
- Quick actions 卡片网格。
- Examples & Resources 卡片网格。

### together-models.png
- Featured Models 横向卡片。
- Browse Models 表格 + 左侧多维筛选。
- 价格显示：输入/输出每 1M tokens，含 cached input 价格。
- Actions 列提供每行操作入口。

### together-playground.png
- 顶部模型选择器 + API view 按钮。
- 左侧聊天区域（System Prompt + messages）。
- 右侧参数面板：Max Tokens / Temperature / Safety Model / Reasoning / Response Format / Functions。
- 简洁的白色主题。

### together-profile.png
- Account / Organization / Project 三层设置结构。
- Profile、SSH Key、Integrations、Members、Billing、Cost Analytics 等子项。
- Theme settings 支持 system / light / dark。
- Privacy & Security 设置项。
