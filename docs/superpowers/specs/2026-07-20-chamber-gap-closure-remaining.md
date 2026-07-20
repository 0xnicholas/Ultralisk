# Chamber 差距闭环 — 剩余 4 项设计规格

**日期**: 2026-07-20
**状态**: accepted
**依赖**: `docs/superpowers/plans/2026-07-17-chamber-gap-closure-plan.md`、ADR-007（可观测性）
**前序交付**: AI 诊断服务、事件引擎、事件指标预取、事件路由、Prometheus Webhook、AiAssistantPanel — 均已完成并接入真实 API

---

## 1. 总览

Chamber 差距补齐计划 11 项交付物中 6 项已完成。剩余 4 项分为两层：

| 层 | 任务 | 堵点 | 工作量 |
|----|------|------|--------|
| 后端 | 自动修复执行器（6 个 TODO 桩 → 真实实现） | 无 GPU/K8s 集群，无法执行真实操作 | 3 天（实现框架 + 预留接口）+ GPU 到位后对接 |
| 后端 | Slack 双向 ChatOps | 从零构建 | 4 天 |
| 前端 | 事件详情指标 mock → 真实数据 | `incidentMetrics.ts` 已就绪，UI 未接入 | 0.5 天 |
| 前端 | Alerts 管理页面 | API 已实现，UI 缺失 | 1 天 |

---

## 2. 自动修复执行器

### 2.1 现状

`autoRemediationService.ts`（400 行）的决策框架完整：加载策略、验证允许列表、分类 Tier 1/2/3、写入 `action_log` JSONB、审批流程。但 6 个执行函数全部为桩：

```typescript
// 当前代码（L280-330 区域）
case 'restart_worker':
  // TODO Phase D: call Gateway admin API to restart pod
  logger.info(`Would restart worker: ${action.target}`);
  break;
case 'clear_cache':
  // TODO Phase D: clear model cache on pod
  break;
// ... 其余 5 个同理
```

### 2.2 设计

#### 2.2.1 执行器接口

```typescript
// 每个执行器签名统一：
type RemediationExecutor = (
  action: RemediationAction,
  incidentId: string,
  context: ExecutionContext,
) => Promise<ExecutionResult>;

interface ExecutionContext {
  gatewayBaseUrl: string;    // 从 GATEWAY_URL 环境变量
  k8sApiUrl?: string;        // K8s API Server 地址（Phase 2 可选项）
  kaiSchedulerUrl?: string;  // KAI Scheduler 地址（Phase 2 可选项）
}

interface ExecutionResult {
  success: boolean;
  message: string;
  detail?: Record<string, unknown>;
}
```

#### 2.2.2 6 个执行器实现策略

| 执行器 | 无 GPU/K8s 环境的实现 | GPU 到位后的实现 |
|--------|---------------------|-----------------|
| `restart_worker` | 调用 Gateway `POST /v1/admin/models/{modelId}/warmup` 通过 KAI Scheduler 创建新 Pod 替代故障 Pod。无 KAI 时返回 `{ executed: false, reason: "kai_unavailable" }`。完整的 Pod 重启需要 K8s API 集成（Phase 2+） | 同左；K8s API 就绪后可改为 `kubectl delete pod` + 等待 Ready |
| `scale_up` | 调用 Console API `POST /v1/admin/deployments/{id}/scale`。无 K8s 时操作记录到 action_log 但不执行 | 同左 |
| `switch_model` | 调用 Gateway `PATCH /v1/internal/route-table/weight` 将流量从当前模型切到备用模型。`fallback_model_id` 需在 `auto_remediation_settings.tiers` JSONB 顶层新增（例：`{"tier1":{...}, "fallback_model_id": "llama-3.1-8b-instruct"}`） | 同左 |
| `rollback_model` | 调用 Console API `POST /v1/admin/deployments/{id}/rollback`，传入 `deployment_versions` 中上一版本 | 同左 |
| `reboot_node` | 仅在 `k8sApiUrl` 可用时执行：`kubectl drain` → `kubectl uncordon`。无 K8s 时返回 unavailable | K8s API 调用 |
| `notify_support` | 立即执行：通过 `notificationService.sendSlack()` 推送告警，附带 incident ID 和 action 描述 | 同左 |

注：原计划中的 `clear_cache` 执行器已移除——其效果可通过 `restart_worker`（重启 Pod 清空 GPU 显存缓存）实现，无需额外的 gRPC 接口或 proto 变更。

#### 2.2.3 无 GPU 环境的优雅降级

核心原则：**日志完整 + 操作可追溯，不因基础设施缺失而报错**。

```typescript
// 每个执行器返回标准结果，调用方不感知基础设施状态：
if (!context.k8sApiUrl && action.type === 'reboot_node') {
  await appendToActionLog(incidentId, {
    ...entry,
    status: 'skipped',
    message: 'K8s API unavailable — node reboot deferred',
  });
  return { success: false, reason: 'kai_unavailable' };
}
```

### 2.3 文件变更

| 文件 | 变更 |
|------|------|
| `console/console-api/src/services/autoRemediationService.ts` | 替换 6 个 TODO 桩，每个执行器 20-40 行。环境变量直接在服务中读取 (`process.env.GATEWAY_URL` 等) |

---

## 3. 事件详情指标接入

### 3.1 现状

`IncidentDetailPage.tsx` 中间图表使用硬编码 mock：

```typescript
// 当前代码
const mockMetrics = useMemo(() => ({
  utilizationPct: Array.from({ length: 24 }, () => Math.random() * 100),
  memoryUsedMb: Array.from({ length: 24 }, () => Math.random() * 81920),
  temperature: Array.from({ length: 24 }, () => 40 + Math.random() * 30),
  timestamps: Array.from({ length: 24 }, (_, i) => `${i}:00`),
}), []);
```

### 3.2 设计

后端 `incidentMetrics.ts` 已有 `fetchRelatedMetrics()` 函数（137 行），支持：
- 按 `nodeId` + `cardIndex` 查询 `gpu_metric_snapshots`
- 可配置时间窗口和采样点数
- 无真实数据时回退到合成数据（已有 realistic failure-pattern simulation）

变更路径：

1. **后端**: 在 `incidents.ts` 路由的 `GET /incidents/:id` 响应中附带 metrics
2. **前端**: 在 `console/console-ui/src/api/incidents.ts` 中增加 `IncidentMetrics` 类型
3. **前端**: `IncidentDetailPage.tsx` 从 API 数据渲染 AreaChart，移除 `mockMetrics`

```
GET /v1/admin/incidents/:id 响应新增字段：
{
  "data": {
    ...existing_fields,
    "metrics": {           // ← 新增，可选字段
      "utilizationPct": [...],
      "memoryUsedMb": [...],
      "temperature": [...],
      "timestamps": [...]
    }
  }
}
```

后端实现：

```typescript
// incidents.ts GET /:id handler 追加：
const nodeId = incident.affected_entities?.node_id;
const metrics = nodeId
  ? await fetchRelatedMetrics({ nodeId })
  : null;
res.json({ data: { ...incident, metrics } });
```

### 3.3 文件变更

| 文件 | 变更 |
|------|------|
| `console/console-api/src/routes/incidents.ts` | `GET /:id` 追加 metrics 字段 |
| `console/console-ui/src/api/incidents.ts` | 新增 `IncidentMetrics` 类型和 fetch 逻辑 |
| `console/console-ui/src/pages/incidents/IncidentDetailPage.tsx` | 移除 `mockMetrics`，接 API 数据 |

---

## 4. Alerts 管理页面

### 4.1 现状

- API: `routes/alerts.ts` 已实现（27 行），支持 `GET /alerts` 和 `POST /alerts/:id/suppress`
- Hook: `useAlerts` 已存在（被 `AutoRemediationPolicy` 和 `SlackIntegration` 组件消费）
- UI: 无独立 Alerts 页面，无路由，无侧边栏入口

### 4.2 设计

#### 页面布局

```
┌────────────────────────────────────────────────────┐
│  Alerts                                     🔔 3 Active  │
├────────────────────────────────────────────────────┤
│  [Severity filter: All | Critical | Warning | Info]   │
│  [Status filter:    All | Firing | Resolved | Suppressed] │
├────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────┐   │
│  │ 🔴 GPU 利用率骤降 · node-7.h100-a         │   │
│  │    Firing · 2026-07-20 10:32 · 利用率从 85% → 12%│   │
│  │    [Suppress]  [View Incident →]            │   │
│  └──────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────┐   │
│  │ 🟡 GPU 显存压力 · node-3.h100-a             │   │
│  │    Resolved · 2026-07-20 09:15              │   │
│  └──────────────────────────────────────────────┘   │
│  ...                                                │
└────────────────────────────────────────────────────┘
```

#### 数据模型

已有 `alerts` 表（迁移 003）：

```sql
alerts (
  id, incident_id, name, description, severity,
  source_metric, condition JSONB, status, fingerprint,
  fired_at, resolved_at, notification_channels JSONB
)
```

与 `incidents` 的关联通过 `incident_id` FK 实现。列表页不做深度交互（详情跳转 Incident Detail）。

#### 路由和导航

- 路由: `/alerts` → `AlertsPage`
- 侧边栏: Operations 分组下新增 "Alerts" 项，位于 "Incidents" 下方
- 无模式限制（SaaS 和 Private 均显示）

### 4.3 文件变更

| 文件 | 变更 |
|------|------|
| `console/console-ui/src/pages/alerts/AlertsPage.tsx` | 新建页面组件 |
| `console/console-ui/src/App.tsx` | 新增 `/alerts` 路由 |
| `console/console-ui/src/components/Sidebar.tsx` | Operations 分组新增 Alerts 导航项 |

---

## 5. Slack 双向 ChatOps

### 5.1 现状

- `notificationService.ts`（275 行）：仅做**单向**预算告警推送（`sendSlack()` 通过 webhook URL）
- `slack_integrations` 表：有 `slash_commands` JSONB 字段存储命令定义，但**无执行代码**
- 无 Socket Mode、无斜杠命令处理、无 Block Kit 交互按钮、无事件推送

### 5.2 范围决策

Chamber 的 Chambie 通过 Slack Socket Mode 实现全双工（接收斜杠命令 + 推送通知 + 交互按钮）。Ultralisk Phase 2 不追求全量对标——**Slack 是 AI 助手的一个渠道，不是独立产品**。

本 spec 覆盖：

| 能力 | 是否覆盖 | 说明 |
|------|---------|------|
| Socket Mode 连接 | ✓ | 接收斜杠命令 + 交互按钮点击 |
| `/ultralisk incident <id>` | ✓ | 查询事件详情 + AI 分析结论 |
| `/ultralisk ask <incident_id> <question>` | ✓ | 对指定事件追问，流式返回（复用 `POST /incidents/:id/ask` SSE 端点） — 作用域限定在单事件上下文 |
| Block Kit 事件通知 | ✓ | 新事件/状态变更推送到配置的 channel |
| Block Kit 交互按钮 | ✓ | "Approve Remediation" / "Dismiss" 双按钮 |
| 斜杠命令注册 | ✓ | 安装时通过 Slack API `commands.create` |
| 全量 Slash 命令 | ✗ | 不做 `/ultralisk models`、`/ultralisk gpu` 等——范围膨胀 |
| 通用 AI 问答（无 incident 上下文） | ✗ | 不做——当前 `/incidents/:id/ask` 限定于事件上下文，通用 chat 需要新的后端端点，不在 Phase 2 范围内 |
| 多 workspace 支持 | ✗ | Phase 2 仅单 workspace |

### 5.3 架构

```
Slack API ←──Socket Mode──→ slackBotService.ts
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              aiDiagnosis   incidents    autoRemediation
              Service.ts    Route        Service.ts
                                  │
                                  ▼
                          notificationService.ts (复用 sendSlack)
```

**关键技术决策**:

- **Socket Mode 而非 HTTP endpoint**: Slack Socket Mode 不需要公网可达的 HTTP 回调 URL，私有化部署场景下这是硬需求
- **不引入 Slack Bolt（全栈框架）**: 用 `@slack/web-api` + `@slack/socket-mode` 两个底层包
- **单进程**: Socket Mode 连接在 Console API 进程内启动，与 Express 共享 PostgreSQL 连接池

### 5.4 API 设计

#### 5.4.1 斜杠命令处理

```
/ultralisk incident <id>
  → 查询 incidents 表
  → 返回 Block Kit 卡片：严重度 + 状态 + AI 根因分析 + 建议
  → 附带 "查看详情" 链接（Console URL）+ "Approve Remediation" 按钮（如有待审批操作）

/ultralisk ask <incident_id> <question>
  → 调用 `POST /incidents/:id/ask` SSE 端点（复用现有路由）
  → 流式输出逐块更新 Slack 消息（Slack chat.update API）
  → 限定于单事件上下文——通用问答不在 Phase 2 范围
```

#### 5.4.2 事件推送

新事件创建或状态变更时（`incidentEngine.ts` 中触发），推送到配置的 Slack channel：

```
Block Kit 消息结构：
┌──────────────────────────────────────┐
│ 🔴 Critical Incident: GPU util drop  │
│ node-7.h100-a · Jul 20 10:32        │
│                                      │
│ Root cause: NVIDIA driver crash     │
│ (confidence: 92%)                    │
│                                      │
│ [Approve Remediation] [Dismiss]     │
└──────────────────────────────────────┘
```

交互按钮通过 `block_actions` 事件回到 `slackBotService`，调用 `autoRemediationService.approveAction()` 或记录 dismiss。

#### 5.4.3 DB 迁移 011

```sql
-- 011_slack_bot_fields.sql
ALTER TABLE slack_integrations
  ADD COLUMN IF NOT EXISTS bot_token        TEXT,       -- Slack Bot User OAuth Token (encrypted at rest)
  ADD COLUMN IF NOT EXISTS app_token        TEXT,       -- Slack App-level Token for Socket Mode (encrypted at rest)
  ADD COLUMN IF NOT EXISTS app_id           VARCHAR(50),
  ADD COLUMN IF NOT EXISTS incident_channel VARCHAR(50), -- 事件推送目标 channel ID
  ADD COLUMN IF NOT EXISTS enabled_commands JSONB DEFAULT '["incident","ask"]';
```

`bot_token` 和 `app_token` 加密存储，使用 Node.js `crypto` 模块的 AES-256-GCM（`createCipheriv`），密钥从环境变量 `ENCRYPTION_KEY` 读取。

### 5.5 文件变更

| 文件 | 变更 |
|------|------|
| `console/console-api/src/services/slackBotService.ts` | 新建（~300 行）：Socket Mode 连接、斜杠命令路由、Block Kit 构建、交互按钮处理 |
| `console/console-api/src/services/notificationService.ts` | 新增 `sendIncidentAlert()` 方法，复用现有 Slack webhook 推送代码 |
| `console/console-api/src/services/incidentEngine.ts` | `runIncidentPipeline()` 的 `logger.info` 之前追加 Slack 推送调用，使用 `.catch()` 确保推送失败不阻塞 pipeline |
| `console/console-api/drizzle/011_slack_bot_fields.sql` | 新建迁移 |
| `console/console-api/package.json` | 新增 `@slack/web-api`、`@slack/socket-mode` 依赖 |
| `console/console-api/src/index.ts` | 启动 `slackBotService`（条件：slack_integrations.connected = true） |

---

## 6. 实施顺序

| 顺序 | 任务 | 依赖 | 预估 |
|------|------|------|------|
| 1 | 事件详情指标接入 | 无 | 0.5 天 |
| 2 | Alerts 管理页面 | 无 | 1 天 |
| 3 | 自动修复执行器 | 无（框架实现）；GPU/K8s（真实执行） | 3 天 |
| 4 | Slack ChatOps | 3（复用 AI 诊断 + 自动修复审批） | 4 天 |

任务 1-2 互不依赖可并行。任务 3 不依赖 1-2。任务 4 依赖任务 3（交互按钮触发 `approveAction`）。

---

## 7. 风险

| 风险 | 缓解 |
|------|------|
| Slack API 依赖 `@slack/web-api` 包的版本兼容性 | 锁定 `^7.0`，已知稳定 |
| Socket Mode 断线重连 | Slack 客户端内置自动重连 + 指数退避，上层只需监听 `disconnect` 事件并记录日志 |
| 自动修复执行器在无 GPU 环境下的价值存疑 | 返回 `skipped` 状态而非报错，日志完整可供审计。GPU 到位后无需改代码 |
| bot_token / app_token 加密存储 | 环境变量级加密（`AES-256-GCM`），不外泄到日志。Phase 2 不强求硬件 HSM |
