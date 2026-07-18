# Chamber 能力补齐计划 — AI 智能运维模块

> **日期**：2026-07-17
> **依据**：`docs/together-chamber-combined-analysis.md`、`docs/superpowers/specs/2026-07-10-ultralisk-console-design.md` §7.7
> **目标**：补齐 Ultralisk 在 AI 自主运维层与 Chamber 的差距，实现设计文档中 Phase 2 规划的 AI 诊断 + Slack ChatOps + 自动修复能力
> **工期估算**：4-6 周（单人全栈）

---

## 一、现状 vs 目标差距

| 能力 | Chamber | Ultralisk 设计文档目标 | Ultralisk 当前代码 | 差距 |
|------|---------|----------------------|-------------------|------|
| **AI 故障诊断** | Chambie 自动分析根因 | AI 助手自动分析 Incident（§7.7.3） | `AiAssistantPanel.tsx` 只有 mock 回复，无后端服务 | ❌ **未实现** |
| **Slack 双向 ChatOps** | Slack 机器人对话运维 | `/ultralisk ask` + 通知推送 + 交互按钮（§7.7.7-7.7.8） | `sendSlack()` 仅单向预算告警推送 | ❌ **未实现** |
| **分级自动修复** | 部分自动修复 | Tier 1 全自动 / Tier 2 半自动 / Tier 3 手动（§7.7.5） | 无相关代码 | ❌ **未实现** |
| **Incident ↔ Alert 联动** | 告警自动创建诊断 | Prometheus 告警 → Incident 自动创建 → AI 分析（§7.7.2） | Incidents CRUD + Alerts CRUD 独立，无自动联动 | ❌ **未实现** |
| **AI 分析结果持久化** | 自动输出 | `incidents.ai_analysis` JSON 字段存储分析结果 | 表有字段但无写入逻辑 | ⚠️ **字段存在，逻辑缺失** |

---

## 二、总体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    新增 / 改造模块                            │
│                                                             │
│  ┌───────────────────┐  ┌──────────────────┐                 │
│  │ AI Diagnosis      │  │ Slack Bot        │                 │
│  │ Service           │  │ Gateway          │                 │
│  │                   │  │                  │                 │
│  │ • analyze()       │  │ • /ultralisk ask │                 │
│  │ • root_cause()    │  │ • incident push  │                 │
│  │ • recommend()     │  │ • button ack     │                 │
│  └────────┬──────────┘  └────────┬─────────┘                 │
│           │                      │                           │
│           └──────────┬───────────┘                           │
│                      ▼                                       │
│           ┌──────────────────────┐                           │
│           │  Incident Engine     │  ← 新增                    │
│           │  (告警→Incident→分析 │                           │
│           │   →修复→通知 编排)   │                           │
│           └──────────────────────┘                           │
│                      │                                       │
│                      ▼                                       │
│           ┌──────────────────────┐                           │
│           │  现有基础设施         │                           │
│           │  pool.query()        │                           │
│           │  postmark@app/chat   │                           │
│           │  notificationService │                           │
│           └──────────────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、实施阶段

### Phase A：AI 诊断后端服务（Week 1-2）

#### A.1 创建 `src/services/aiDiagnosisService.ts`

核心服务：接收 Incident 数据 → 调用 LLM 分析 → 返回结构化根因分析。

```typescript
// 输入：Incident + 关联指标快照
interface DiagnosisInput {
  incidentId: string;
  title: string;
  description: string;
  severity: string;
  affectedEntities: {
    nodeId?: string;
    clusterId?: string;
    endpointId?: string;
    gpuCardIndex?: number;
  };
  // 自动关联的时间窗口指标（分析前由 IncidentEngine 预取）
  metrics: {
    gpuUtilization: number[];
    memoryUsage: number[];
    temperature: number[];
    timestamps: string[];
  };
}

// 输出：结构化分析结果
interface DiagnosisResult {
  modelUsed: string;            // 如 "llama-3.3-70b-instruct"
  analyzedAt: string;
  rootCauses: Array<{
    rank: number;
    cause: string;
    confidence: number;         // 0-1
    evidence: string;           // 指标证据描述
    suggestedAction: string;
  }>;
  recommendations: Array<{
    risk: 'low' | 'medium' | 'high';
    action: string;
    tier: 1 | 2 | 3;           // 对应自动修复级别
    automated: boolean;
  }>;
  summary: string;              // TL;DR 一句话摘要
}
```

**设计要点**：
- LLM 调用走内部 `/v1/chat/completions`（用 Ultralisk 自己的推理 API 诊断自己的 GPU）
- System prompt 固化诊断框架（OOM、GPU 掉线、温度过高、内存泄漏等常见故障模式）
- 模型推荐用 `llama-3.3-70b-instruct`（SaaS）/ DeepSeek V4 Pro（私有化）
- 超时 30s，失败时返回 fallback 分析而非阻断 Incident 创建
- 结果写入 `incidents.ai_analysis` JSONB 字段

**关键代码路径**：
```
Incident 创建 → IncidentEngine.analyze()
  → 查询关联 GPU 指标（过去 30 分钟）
  → 构造 DiagnosisInput
  → POST /v1/chat/completions（stream=false，response_format=json_object）
  → 解析 DiagnosisResult
  → UPDATE incidents SET ai_analysis = $jsonb
  → 如果 severity=critical → 自动触发 Slack 推送
```

#### A.2 关联数据预取

创建 `src/services/incidentMetrics.ts`：

```typescript
// 给定 affectedEntities，预取关联的 GPU 指标快照
async function fetchRelatedMetrics(input: {
  nodeId?: string;
  clusterId?: string;
  gpuCardIndex?: number;
  windowMinutes?: number;  // default 30
}): Promise<{
  gpuUtilization: number[];
  memoryUsage: number[];
  temperature: number[];
  timestamps: string[];
}>;

// 使用 ClickHouse（当可用时）或 PG 回退查询
// SELECT utilization_pct, memory_used_mb, temperature, timestamp
// FROM gpu_metric_snapshots
// WHERE node_id = $1 AND timestamp > NOW() - INTERVAL '30 minutes'
// ORDER BY timestamp
```

#### A.3 AI 诊断测试

```typescript
// src/services/aiDiagnosisService.test.ts
// - 模拟 LLM 返回 DiagnosisResult JSON
// - 验证 metrics 预取逻辑
// - 验证 fallback 路径
// - 验证 ai_analysis 字段写入
```

---

### Phase B：Slack 双向 ChatOps（Week 2-3）

#### B.1 创建 `src/services/slackBotService.ts`

Slack 交互框架：

```typescript
interface SlackEventHandler {
  // 处理 /ultralisk ask <question>
  handleAsk(command: string, userId: string, channelId: string): Promise<string>;
  // 处理 /ultralisk incident <id>
  handleIncidentQuery(incidentId: string, channelId: string): Promise<string>;
  // 处理交互按钮回调
  handleActionCallback(payload: {
    actionId: string;        // "approve_remediation" | "dismiss"
    incidentId: string;
    userId: string;
  }): Promise<void>;
}

// Slack 消息构造
function buildIncidentNotification(incident: Incident, diagnosis: DiagnosisResult): {
  blocks: Block[];  // Slack Block Kit
};
```

**设计要点**：
- 使用 Slack Socket Mode（无需暴露 Webhook 端口，适合私有化部署）
- 命令注册：`/ultralisk ask <自然语言问题>`、`/ultralisk incident <id>`
- Incident 推送：使用 Block Kit 构建富卡片，含严重度标签、AI 摘要、操作按钮
- 交互按钮：Approve Remediation / Dismiss / View in Console
- 回复 Thread：AI 分析详情作为 thread reply，避免频道刷屏

#### B.2 Slack 配置表扩展

```sql
-- 已有 slack_integrations 表，补充 bot_token 和 app_id 字段
ALTER TABLE slack_integrations ADD COLUMN IF NOT EXISTS bot_token VARCHAR(255);
ALTER TABLE slack_integrations ADD COLUMN IF NOT EXISTS app_id VARCHAR(100);
ALTER TABLE slack_integrations ADD COLUMN IF NOT EXISTS channel_id VARCHAR(100);
ALTER TABLE slack_integrations ADD COLUMN IF NOT EXISTS incident_channel VARCHAR(100);
ALTER TABLE slack_integrations ADD COLUMN IF NOT EXISTS enabled_commands JSONB DEFAULT '["ask","incident"]';
```

#### B.3 Incident 事件推送

改造 `incidents.ts` 路由：创建 Incident 时自动推送 Slack 通知。

```typescript
// 在 POST /incidents 或 Incident 自动创建时：
if (slackIntegration?.incident_channel) {
  await slackBotService.pushIncidentNotification(incident, diagnosis, slackIntegration.incident_channel);
}
```

---

### Phase C：分级自动修复（Week 3-4）

#### C.1 修复引擎 `src/services/autoRemediationService.ts`

```typescript
// 修复策略配置
interface RemediationPolicy {
  orgId: string;
  tier1Enabled: boolean;    // 全自动：低风险操作，不需要审批
  tier2Enabled: boolean;    // 半自动：需要 Slack 按钮审批
  tier3Manual: boolean;     // 手动：仅生成建议，不执行
  allowedActions: string[]; // 允许的修复动作白名单
}

// 修复动作
type RemediationAction = 
  | { type: 'restart_worker'; workerId: string; reason: string }
  | { type: 'scale_up'; modelId: string; replicas: number }
  | { type: 'clear_cache'; nodeId: string }
  | { type: 'rollback_model'; modelId: string; version: string }
  | { type: 'notify_support'; message: string };

// 执行流程
async function executeRemediation(
  incident: Incident,
  diagnosis: DiagnosisResult,
  policy: RemediationPolicy,
): Promise<RemediationResult>;
```

**三级策略**：

| 级别 | 风险 | 自动化程度 | 示例 |
|------|------|-----------|------|
| Tier 1 | 低 | 全自动，无需审批 | 重启 stuck worker、清空 GPU cache |
| Tier 2 | 中 | 半自动，需 Slack 按钮确认 | 扩容 replica、切换 fallback 模型 |
| Tier 3 | 高 | 仅生成建议，人工执行 | 回滚模型版本、重启节点 |

#### C.2 执行日志记录

每个修复动作记录到 `incidents.action_log`，包含：

```typescript
{
  timestamp: string;
  action: string;            // "auto_remediation.restart_worker"
  tier: 1 | 2 | 3;
  triggeredBy: string;       // "system" | slack_user_id
  status: 'pending' | 'running' | 'success' | 'failed';
  details: { workerId: string; reason: string };
  result?: { success: boolean; message: string };
}
```

#### C.3 修复策略配置页面

在 Console UI 的 Settings 页面新增「Auto-Remediation」Tab：

- Tier 1/2/3 开关
- 允许的修复动作列表（多选）
- Slack 审批超时设置
- 操作审计日志展示

---

### Phase D：Incident ↔ Alert 联动编排（Week 4-5）

#### D.1 创建 `src/services/incidentEngine.ts`

事件驱动编排引擎，连接 Prometheus 告警 → Incident 创建 → AI 分析 → 修复 → 通知 全链路。

```typescript
class IncidentEngine {
  // Prometheus Alertmanager webhook receiver
  async handleAlertWebhook(alert: PrometheusAlert): Promise<void> {
    // 1. 去重：检查相同 fingerprint 是否已有 open Incident
    // 2. 创建 Incident（写入 DB）
    // 3. 触发 AI 分析（异步）
    // 4. 根据 severity 延迟决定修复级别
    // 5. 推送通知（Slack / Email）
  }

  // 定时检查：自动关闭超过 N 小时未更新的已缓解 Incident
  async autoResolveStale(): Promise<void> {
    // UPDATE incidents SET status = 'resolved', resolved_at = NOW()
    // WHERE status = 'mitigated' AND mitigated_at < NOW() - INTERVAL '24 hours'
  }

  // 指标阈值检查（无需 Prometheus 场景的轮询模式）
  async checkThresholds(): Promise<void> {
    // 查询最新 gpu_metric_snapshots
    // 如果 GPU 利用率骤降 > 50% → 创建 Incident
    // 如果温度 > 85°C → 创建 Incident
  }
}
```

#### D.2 Prometheus Alertmanager Webhook Receiver

```typescript
// POST /v1/admin/webhooks/prometheus/alert
// 接收 Alertmanager 的 webhook 回调
// 验证签名（可选）
// 转发到 IncidentEngine.handleAlertWebhook()
```

#### D.3 模型变化事件

```typescript
// 监听模型加载失败、worker crash 等内部事件
// 通过 Gateway 的 /v1/internal/models/{id}/ready 回调触发
// Gateway 冷启动失败 → 自动创建 Incident
```

---

### Phase E：前端改造（Week 1-5，并行）

#### E.1 AI 助手面板接入真实 API

改造 `AiAssistantPanel.tsx`：

- 移除 mock setTimeout 回复
- 新增 `useAiDiagnosis(incidentId)` hook，从 `incident.ai_analysis` 读取数据
- 对话追问：`POST /v1/admin/incidents/:id/ask` → 调用 LLM 流式回答（复用 Playground 的 SSE 模式）
- 显示分析状态（analyzing / ready / failed）
- 根因列表用进度条显示置信度（已有）
- 建议操作增加「Execute」按钮（只有 Tier 1 显示自动执行按钮）

#### E.2 自动修复设置页面

新增 `src/private/pages/settings/AutoRemediationSettings.tsx`：

- 修复策略配置表单
- 操作审计日志列表
- Slack 集成状态展示

#### E.3 Incident 列表增加 AI 状态列

`IncidentList.tsx` 增加「AI 分析状态」徽标：

- `ai_analysis` 不为空 → 🟢 Ready
- `ai_analysis` 为 null 且 `status = open` → 🟡 Analyzing
- `ai_analysis` 为 null 且 `status != open` → ⚪ Skipped

---

## 四、工期估算

| Phase | 模块 | 文件 | 估时 | 依赖 |
|-------|------|------|------|------|
| **A** | AI Diagnosis Service | `src/services/aiDiagnosisService.ts` + test | **5 天** | 无 |
| **A** | Metrics prefetch | `src/services/incidentMetrics.ts` + test | **2 天** | ClickHouse/PG |
| **A** | DB migration | `drizzle/010_ai_analysis_fields.sql` | **1 天** | 无 |
| **B** | Slack Bot Service | `src/services/slackBotService.ts` | **4 天** | A |
| **B** | Slack event handlers | 路由 + commands | **2 天** | B 核心 |
| **B** | Migration | `drizzle/011_slack_bot_fields.sql` | **1 天** | 无 |
| **C** | Auto-Remediation Engine | `src/services/autoRemediationService.ts` | **4 天** | A, B |
| **C** | Policy config UI | `AutoRemediationSettings.tsx` | **2 天** | C |
| **D** | Incident Engine | `src/services/incidentEngine.ts` | **3 天** | A, C |
| **D** | Prometheus webhook | 路由 + 验证 | **2 天** | D |
| **E** | UI: AI panel real API | `AiAssistantPanel.tsx` | **3 天** | A |
| **E** | UI: Incident AI status | `IncidentList.tsx` | **1 天** | A |
| **E** | UI: 修复策略页面 | Settings 页面 | **2 天** | C |
| **合计** | | | **~32 天（6-7 周）** | |

---

## 五、文件清单

### 新增文件（12 个）

```
console/console-api/src/
├── services/
│   ├── aiDiagnosisService.ts       # AI 诊断核心服务
│   ├── aiDiagnosisService.test.ts
│   ├── incidentMetrics.ts          # 关联指标预取
│   ├── incidentMetrics.test.ts
│   ├── incidentEngine.ts           # 告警→Incident→修复编排
│   ├── incidentEngine.test.ts
│   ├── slackBotService.ts          # Slack ChatOps 双向集成
│   ├── slackBotService.test.ts
│   └── autoRemediationService.ts   # 分级自动修复引擎
│       └── autoRemediationService.test.ts
└── routes/
    └── webhooks.ts                 # Prometheus Alertmanager webhook

console/console-api/drizzle/
├── 010_ai_analysis_fields.sql      # ai_analysis 增强字段
└── 011_slack_bot_fields.sql        # Slack bot 配置字段

console/console-ui/src/
└── private/pages/settings/
    └── AutoRemediationSettings.tsx  # 修复策略配置页面
```

### 改造文件（8 个）

```
console/console-api/src/
├── routes/incidents.ts             # 增加 AI 分析触发 + Slack 推送
├── index.ts                        # 注册 webhook 路由 + 启动 IncidentEngine
└── services/notificationService.ts # 复用到 Slack Bot

console/console-ui/src/
├── components/incidents/AiAssistantPanel.tsx   # mock → 真实 API
├── components/incidents/IncidentList.tsx        # 增加 AI 状态列
├── pages/incidents/IncidentDetailPage.tsx       # 对接真实诊断数据
├── pages/settings/SettingsPage.tsx              # 增加 Auto-Remediation Tab
└── App.tsx                                       # 注册新路由
```

---

## 六、关键设计决策

| 决策 | 选项 | 选择 | 理由 |
|------|------|------|------|
| LLM 模型 | 外部 API vs 自推理 | **自推理**（`/v1/chat/completions`） | 既是功能又是信任证明；私有化客户无需外网 |
| 诊断时机 | 同步 vs 异步 | **异步** | Incident 创建不应被 LLM 延迟阻塞 |
| Slack 模式 | Webhook vs Socket Mode | **Socket Mode** | 私有化部署无需暴露端口，更安全 |
| 修复执行 | Console API vs k8s API | **Console API** | 统一权限控制，走 RBAC 审计 |
| AI 分析存储 | incidents 表 vs 独立表 | **incidents.ai_analysis** JSONB | 避免 JOIN，查询简单，且设计文档已定义此字段 |

---

## 七、与现有模块的关系

```
IncidentEngine
  ├─ 读取：incidents 表、alerts 表、gpu_metric_snapshots
  ├─ 写入：incidents（status, ai_analysis, action_log）
  ├─ 调用：aiDiagnosisService（分析）
  ├─ 调用：autoRemediationService（修复）
  ├─ 调用：slackBotService（通知）
  └─ 复用：notificationService（邮件降级路径）

已有基础设施
  ├─ pool.query() → PostgreSQL
  ├─ clickhouseClient.query() → ClickHouse（可用时）
  ├─ POST /v1/chat/completions → 内部推理（Gateway → vLLM/Zealot）
  └─ slack_integrations 表 → Slack 配置
```

---

## 八、验收标准

| 验收项 | 标准 |
|--------|------|
| AI 诊断准确率 | > 80% 根因判断与人工一致（初始版，持续迭代） |
| 诊断延迟 | Incident 创建 → AI 分析完成 < 30s |
| Slack 命令响应 | `/ultralisk ask` → 回答 < 10s |
| Slack 通知推送 | Incident 创建 → Slack 消息 < 5s |
| 自动修复成功率 | Tier 1 > 90%，Tier 2 > 80%（需审批） |
| Incident ↔ Alert 联动 | Prometheus webhook → Incident 创建 < 10s |
| 测试覆盖率 | 新增服务 > 80%（含 mock LLM 响应） |

---

## 九、风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| LLM 诊断结果不稳定 | 根因分析质量差 | System prompt 固化诊断框架 + 多次采样投票 + fallback 模板 |
| Slack API 兼容性 | 私有化客户可能无外网 Slack | Slack 为可选集成；无 Slack 时走 Email + Console 内通知 |
| 自动修复误操作 | 造成更大故障 | Tier 1 仅限低风险操作白名单；所有操作均需审计日志 |
| 自推理依赖自身可用性 | 诊断时推理服务可能已挂 | fallback 用轻量规则引擎（基于指标阈值的确定性判断）|
| 单人多模块并行 | 工期拉长 | 建议按 Phase A→B→C→D→E 串行，A 完成后即可开始 E |

---

*本文档基于 `docs/superpowers/specs/2026-07-10-ultralisk-console-design.md` §7.7 和 `docs/together-chamber-combined-analysis.md` 制定。*
