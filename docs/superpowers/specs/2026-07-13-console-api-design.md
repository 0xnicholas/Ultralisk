# Console API Phase 1 — 设计规格

**日期**: 2026-07-13  
**状态**: draft  
**依赖**: ADR-006 (数据存储), ADR-008 (认证), Auth Service Spec  
**代码位置**: `console/console-api/`（现有 monorepo 内）

---

## 1. 概述

Console API 当前是纯 mock（`fixtures.ts` 内存常驻数据，503 行）。Phase 1 将高频使用的路由组迁移到真实 PostgreSQL，低频路由（依赖 KAI Scheduler/GPU）保留 mock。

**与 Auth Service 的关系**：Console API 不做认证——Gateway 已在 `/v1/admin/*` 路径验证 API Key/JWT 并注入 `X-User-Id`/`X-Org-Id` header。Console API 只需读取这些 header 做授权，不重复验证。登录路由直接转发到 Auth Service。

### 部署拓扑（Phase 1）

```
Console UI (:5173)
    │ /v1/admin/*
    ▼
Gateway (:8080) ──验证 Key──→ Auth Service (:3101)
    │ X-User-Id, X-Org-Id
    ▼
Console API (:3100) ──→ PostgreSQL
                      ──→ Auth Service (仅 /login)
```

---

## 2. 技术选型

| 层 | 当前 | Phase 1 | 理由 |
|---|------|---------|------|
| HTTP 框架 | Express 5 | **保持** | 已有完整路由 |
| 语言 | TypeScript | **保持** | monorepo 统一 |
| DB 驱动 | 无 | **drizzle-orm** + `pg` | 类型安全 ORM, SQL-like API, 轻量 |
| Auth | Mock MOCK_JWT | **转发 Auth Service** | 不重复认证逻辑 |
| 日志 | console.log | **pino** | 结构化日志 |

---

## 3. 目录结构（增量）

```
console/console-api/src/
├── index.ts              # 路由注册（重构为模块化）  ← 修改
├── fixtures.ts           # Mock 数据（保留，12 个低频路由组继续用）  ← 保留
├── db/
│   ├── index.ts          # drizzle-orm 初始化 + pg Pool
│   └── schema.ts         # Drizzle schema（models, raw_usage_events）
├── routes/
│   ├── auth.ts           # /v1/admin/auth/* → 转发 Auth Service（仅 login/logout）
│   ├── apiKeys.ts        # /v1/admin/api-keys → 直读/写 PG
│   ├── models.ts         # /v1/admin/models → 读 PG
│   ├── organization.ts   # /v1/admin/organization → 读 PG
│   ├── usage.ts          # /v1/admin/usage → 读 PG raw_usage_events
│   ├── billing.ts        # /v1/admin/billing → 聚合查询
│   └── playground.ts     # /v1/chat/completions → 转发 Gateway
└── services/
    └── authService.ts    # Auth Service HTTP client
```

---

## 4. 数据库表

复用 Auth Service 已建的表 + 新增 Console 专用表：

### 4.1 已有表（Auth Service 管理）

- `orgs`, `users`, `api_keys` — Console API 只读

### 4.2 新增表

```sql
-- 模型目录
CREATE TABLE models (
    id          VARCHAR(100) PRIMARY KEY,     -- "llama-3.1-8b-instruct"
    name        VARCHAR(255) NOT NULL,        -- "Llama 3.1 8B"
    provider    VARCHAR(100) NOT NULL,        -- "Meta"
    description TEXT,
    status      VARCHAR(20) NOT NULL DEFAULT 'active',  -- active|inactive|coming_soon
    context_length INTEGER NOT NULL DEFAULT 4096,
    pricing_per_1k_input  DECIMAL(10,6) NOT NULL DEFAULT 0,
    pricing_per_1k_output DECIMAL(10,6) NOT NULL DEFAULT 0,
    capabilities JSONB DEFAULT '[]',          -- ["chat", "completion"]
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 计费聚合（由 Gateway usage_writer 写入，Console 只读）
-- raw_usage_events: request_id PK, api_key_id, user_id, org_id, model_id,
--                    prompt_tokens, completion_tokens, started_at, completed_at, status
-- (Gateway 已定义，Console API 只读此表)

-- 月度计费聚合（由 Console API 定时任务生成）
CREATE TABLE billing_summary (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL REFERENCES orgs(id),
    year_month    VARCHAR(7) NOT NULL,         -- "2026-07"
    total_tokens  BIGINT NOT NULL DEFAULT 0,
    total_cost    DECIMAL(12,6) NOT NULL DEFAULT 0,
    UNIQUE(org_id, year_month)
);
```

---

## 5. 路由迁移计划

### 5.1 Auth 路由

| 路由 | 当前 | Phase 1 |
|------|------|---------|
| `POST /auth/login` | 返回 MOCK_JWT | 转发 `POST {AUTH_SERVICE_URL}/login`，接收 `{access_token, refresh_token, user}`，设置 `Set-Cookie: jwt=<access_token>; HttpOnly; Secure; SameSite=Strict` |
| `POST /auth/logout` | 200 OK | 清除 JWT cookie |
| `GET /auth/me` | 返回 MOCK_USER | **直读 PG**（`users` + `orgs` + `api_keys` 表），按 Gateway 注入的 `X-User-Id` 过滤 |

> **为什么 /me 和 /keys 不转发 Auth Service？** Gateway 用 API Key 认证（非 JWT）。Auth Service 的 `/me` 和 `/keys` 端点需要 `Authorization: Bearer <jwt>`。Console API 收到的 Gateway 转发请求带的是 API Key header，不是 JWT。解决方案：Console API 直连共享 PostgreSQL，读 `users`/`orgs`/`api_keys` 表。Auth Service 和 Console API 共享同一数据库。

> **Gateway 需修改**：`/v1/admin/auth/login` 和 `/v1/admin/auth/logout` 需要豁免 auth middleware——登录时还没有 API Key。Gateway `app.rs` 需在 admin router 前增加一个不经过 auth 的 login/logout 路由。

**Auth Service 客户端** (`services/authService.ts`)：
```typescript
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3101';

export async function login(email: string, password: string) {
  const res = await fetch(`${AUTH_SERVICE_URL}/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}
```

### 5.2 API Keys（→ 直读 PG + 直写 PG）

| 路由 | 操作 |
|------|------|
| `GET /api-keys` | 读 `api_keys` 表，WHERE user_id = X-User-Id（Gateway 注入） |
| `POST /api-keys` | 生成 Key（`ultr_` + 32 随机），SHA-256 hash，INSERT 到 `api_keys` 表 |
| `DELETE /api-keys/:id` | UPDATE api_keys SET status='revoked' WHERE id=$1 AND user_id=$2 |
| `PATCH /api-keys/:id` | 暂不实现（Phase 2） |

> **为什么直连 PG 而非转发 Auth Service？** 同上——无 JWT。Auth Service 和 Console API 共享同一 PostgreSQL，直接读写 `api_keys` 表即可。Key 生成逻辑（SHA-256 + `ultr_` 前缀）在 Console API 侧复用。

### 5.3 Models（→ 读 PG）

```sql
-- index.ts 改为：
app.get('/v1/admin/models', async (req, res) => {
  const models = await db.select().from(modelsTable).where(eq(modelsTable.status, 'active'));
  res.json({ data: models, pagination: { page: 1, limit: 20, total: models.length } });
});
```

Seed 数据：migration 预置 2 个模型（Llama 3.1 8B, Llama 3.3 70B），匹配 Gateway 路由表。

### 5.4 Organization（→ 读 PG）

```sql
SELECT * FROM orgs WHERE id = $1  -- 从 Gateway 注入的 X-Org-Id 获取
```

### 5.5 Usage（→ 读 PG）

```sql
SELECT model_id, SUM(prompt_tokens) as prompt, SUM(completion_tokens) as completion,
       date_trunc('hour', started_at) as hour
FROM raw_usage_events
WHERE org_id = $1 AND started_at >= $2
GROUP BY model_id, hour
ORDER BY hour DESC
```

### 5.6 Billing（→ 聚合查询）

从 `raw_usage_events` 聚合计算本月费用 + 历史月度摘要。

### 5.7 Playground（→ 转发 Gateway）

当前 `POST /v1/chat/completions` 返回 mock SSE。改为转发到 Gateway（`GATEWAY_URL`，默认 `http://localhost:8080`），让前端通过 Console API 调用推理。

### 5.8 保留 Mock 的路由（12 组）

以下路由因依赖未部署的基础设施而保留 mock：
- Clusters, Nodes, GPU Cards, Deployments → KAI Scheduler
- Endpoints → KAI Scheduler
- Batch Jobs → GPU 集群
- Incidents, Alerts, Auto-Remediation → Prometheus + Loki
- Cost Analytics → ClickHouse
- GPU Utilization → DCGM Exporter
- Sessions → 内存存储（Playground 会话）
- Integrations/Slack → 未部署
- Invitations → Phase 2

---

## 6. 迁移策略

**渐进式迁移，不重写整个文件。**

1. `index.ts` 拆分为路由模块（`routes/*.ts`），保留原有代码不动
2. 优先迁移 7 个路由组（auth, api-keys, models, organization, usage, billing, playground）
3. 12 个低频路由组保留 `fixtures.ts`
4. 每迁移一个路由组，运行 `pnpm dev` 验证 + curl 测试

---

## 7. 配置

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `DATABASE_URL` | `postgres://localhost:5432/ultralisk` | PostgreSQL 连接 |
| `AUTH_SERVICE_URL` | `http://localhost:3101` | Auth Service |
| `GATEWAY_URL` | `http://localhost:8080` | Gateway (playground 转发) |
| `PORT` | `3100` | 监听端口 |

---

## 8. Phase 1 不做

| 项目 | 何时做 |
|------|--------|
| Clusters/Nodes/Deployments 真实数据 | Phase 2（KAI Scheduler 部署后） |
| Cost Analytics 真实数据 | Phase 2（ClickHouse 部署后） |
| Incident 真实数据 | Phase 2（Prometheus+Loki 部署后） |
| Sessions 持久化 | Phase 2 |
| 数据库 migration 工具（drizzle-kit） | 手动迁移即可 |
| Console UI 改动 | 已就绪，不需要改 |

## 9. Gateway 修改

Console API 迁移需要 Gateway 做一个小改动：**开放 login/logout 路径豁免 auth**。

`gateway/src/app.rs` 中 admin router 当前对所有 `/v1/admin/*` 强制 auth：

```rust
let admin_router = Router::new()
    .route("/v1/admin/{*path}", any(admin_handler))
    .route_layer(middleware::from_fn_with_state(auth_state, auth::authenticate));
```

需改为在 auth middleware 之前注册 login/logout 路由（无 auth），其余路由保持 auth：

```rust
// 无 auth 的 login/logout
let public_routes = Router::new()
    .route("/v1/admin/auth/login", post(admin_handler))
    .route("/v1/admin/auth/logout", post(admin_handler));

// 其余 admin 路由需要 auth
let protected_admin = Router::new()
    .route("/v1/admin/{*path}", any(admin_handler))
    .route_layer(middleware::from_fn_with_state(auth_state, auth::authenticate));

let admin_router = public_routes.merge(protected_admin);
```
