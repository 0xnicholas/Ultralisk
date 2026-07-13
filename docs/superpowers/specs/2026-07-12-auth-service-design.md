# Auth Service Phase 1 — 设计规格

**日期**: 2026-07-12  
**状态**: draft  
**依赖**: ADR-000, ADR-008, ADR-006  
**代码位置**: `auth-service/`（项目根目录，与 `gateway/`、`console/` 平级）

### 依赖 ADR 摘要

| ADR | 与本 spec 相关的关键点 |
|-----|----------------------|
| **ADR-008** (认证策略) | 双通道认证（API Key + JWT）；Gateway 先查 Redis 再调 Auth Service；Key 吊销 Phase 2 Pub/Sub |
| **ADR-006** (数据存储) | Auth Service 使用 Control Plane 的 PostgreSQL |
| **ADR-000** (Platform Object Model) | APIKey 对象 — 本 spec 将其从 org 级改为 user 级绑定（审计溯源）；`quota_limits: JSONB` 替代 `model_allowlist` |
| **Gateway 契约** | Gateway 调用 `POST {AUTH_SERVICE_URL}/validate-key`（无 `/auth/` 前缀，见 `gateway/src/middleware/auth.rs:200`），body `{"api_key": "..."}`，期望 `{user_id, org_id, status, quota_limits}` |

---

## 1. 概述

Auth Service 是 Ultralisk 的统一认证服务。Gateway 调它验证 API Key，Console UI 调它做登录/Key 管理。Phase 1 覆盖核心端点 + PostgreSQL 数据层。

### 部署拓扑

```
Gateway (:8080)  ──POST /validate-key──→  Auth Service (:3101)  ──→  PostgreSQL
Console UI       ──POST /login─────────→                          ──→  Redis (缓存)
```

---

## 2. 技术选型

| 层 | 选型 | 理由 |
|---|------|------|
| HTTP 框架 | **axum** | 与 Gateway 统一 |
| ORM/DB | **sqlx** (PostgreSQL) | 编译期 SQL 检查，async |
| 密码哈希 | **argon2** | OWASP 推荐 |
| JWT | **jsonwebtoken** | 标准 |
| API Key 哈希 | **SHA-256** | 不可逆存储 |
| 配置 | 环境变量 | 与 Gateway 一致 |
| 日志 | **tracing + tracing-subscriber** | 统一 |
| Metrics | **metrics + metrics-exporter-prometheus** | 统一 |

---

## 3. 目录结构

```
auth-service/
├── Cargo.toml
├── migrations/
│   └── 001_init.sql           # users, api_keys, orgs 表
├── src/
│   ├── main.rs                # 入口
│   ├── config.rs              # 环境变量
│   ├── app.rs                 # Router 组装
│   ├── error.rs               # AppError + IntoResponse
│   ├── types.rs               # User, ApiKey, Org 等 domain 类型
│   ├── db/
│   │   ├── mod.rs
│   │   ├── users.rs           # 用户查询
│   │   ├── api_keys.rs        # API Key CRUD
│   │   └── orgs.rs            # 组织查询
│   ├── handlers/
│   │   ├── mod.rs
│   │   ├── validate_key.rs    # POST /validate-key
│   │   ├── login.rs           # POST /login
│   │   ├── refresh.rs         # POST /refresh
│   │   ├── keys.rs            # POST /keys (create + revoke)
│   │   └── me.rs              # GET /me
│   └── auth/
│       ├── mod.rs
│       ├── jwt.rs             # JWT 签发+验证
│       ├── password.rs        # argon2 哈希+验证
│       └── api_key.rs         # Key 生成+哈希
└── tests/
    └── integration/
        └── e2e.rs
```

---

## 4. 数据模型

### 4.1 PostgreSQL Schema

```sql
-- 组织
CREATE TABLE orgs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    slug        VARCHAR(100) NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 用户
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,                  -- argon2id (97+ chars, TEXT for future-proofing)
    display_name    VARCHAR(255),
    role            VARCHAR(50) NOT NULL DEFAULT 'developer',  -- owner|admin|developer|readonly|billing
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- API Key（SHA-256 hash 存储，明文仅创建时返回一次）
CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    org_id          UUID NOT NULL REFERENCES orgs(id),
    key_hash        VARCHAR(64) NOT NULL UNIQUE, -- SHA-256(prefix + random)
    key_prefix      VARCHAR(10) NOT NULL,        -- "ultr_xxxx" 前 9 字符，用于识别
    name            VARCHAR(255),                -- 用户给 Key 起的名字
    status          VARCHAR(20) NOT NULL DEFAULT 'active',  -- active|revoked
    quota_limits    JSONB DEFAULT '{}',          -- {"llama-8b": 100000, "*": 50000}
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at      TIMESTAMPTZ
);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
```

### 4.2 Rust Domain Types

```rust
struct User { id: Uuid, org_id: Uuid, email: String, password_hash: String, display_name: Option<String>, role: String }
struct ApiKey { id: Uuid, user_id: Uuid, org_id: Uuid, key_hash: String, key_prefix: String, name: Option<String>, status: String, quota_limits: serde_json::Value }
struct Org { id: Uuid, name: String, slug: String }
```

---

## 5. API

### 5.1 POST /validate-key

Gateway 调用。热路径，需 < 5ms（不含网络）。

**请求**：
```json
{ "api_key": "ultr_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6" }
```

**响应（active）**：
```json
{
  "user_id": "usr_abc123",
  "org_id": "org_xyz789",
  "status": "active",
  "quota_limits": {
    "llama-8b": 100000,
    "llama-70b": 50000,
    "*": 50000
  }
}
```
HTTP 200

**响应（revoked）**：
```json
{
  "user_id": "",
  "org_id": "",
  "status": "revoked",
  "quota_limits": {}
}
```
HTTP 200（revoked 不是 401——Gateway 需要区分"Key 存在但吊销"和"Key 不存在"）

**响应（not found）**：
HTTP 404，body `{"error": "api_key_not_found"}`

**实现**：
```
1. SHA-256(api_key) → 查 api_keys WHERE key_hash = $1
2. 无匹配 → 404
3. status = 'revoked' → 200 { status: "revoked" }
4. status = 'active' → UPDATE last_used_at → 200 { user_id, org_id, status: "active", quota_limits }
```

### 5.2 POST /login

Console UI 登录。

**请求**：
```json
{ "email": "user@example.com", "password": "secret" }
```

**响应（成功）**：
```json
{
  "access_token": "eyJ...",
  "refresh_token": "r_abc123...",
  "expires_in": 3600,
  "user": { "id": "usr_001", "email": "user@example.com", "display_name": "Alice", "role": "admin", "org": { "id": "org_001", "name": "MyOrg" } }
}
```
HTTP 200。access_token 是 JWT，refresh_token 是随机字符串（存内存 HashMap，重启丢失）。

**响应（失败）**：
HTTP 401，`{"error": "invalid_credentials"}`

**实现**：
```
1. SELECT * FROM users WHERE email = $1
2. 无匹配 → 401
3. argon2::verify(password_hash, password) → 不匹配 → 401
4. 生成 JWT (sub: user_id, org_id, role, iat, jti, iss, exp: +1h)
5. 生成 refresh_token (32 字符随机)，存入内存 HashMap (key: token_hash, value: {user_id, expires_at})
6. 返回
```

> **refresh_token 存储**：Phase 1 存内存 HashMap + 定时清理过期条目。重启全部失效，用户需重新登录。Phase 2 迁至 PG `refresh_tokens` 表。

### 5.3 POST /refresh

**请求**：
```json
{ "refresh_token": "r_abc123..." }
```

**响应**：
```json
{ "access_token": "eyJ...", "expires_in": 3600 }
```

**实现**：
```
1. SHA-256(refresh_token) → 查内存 HashMap
2. 未找到或已过期 → 401
3. 生成新 JWT + 新 refresh_token（轮换：删除旧条目，插入新条目）
4. 返回新 JWT
```

### 5.4 POST /keys

创建或吊销 API Key。需 JWT 认证（从 Authorization header 提取）。

**创建 Key**：
```json
{ "action": "create", "name": "my-key", "quota_limits": { "llama-8b": 100000 } }
```
响应：
```json
{ "id": "key_001", "key": "ultr_a1b2c3...", "key_prefix": "ultr_a1b2", "name": "my-key", "created_at": "..." }
```
明文 Key 只返回这一次。

**吊销 Key**：
```json
{ "action": "revoke", "key_id": "key_001" }
```
响应：HTTP 200 `{"status": "revoked"}`

### 5.5 GET /me

需 JWT 认证。返回当前用户信息。

**响应**：
```json
{
  "id": "usr_001",
  "email": "user@example.com",
  "display_name": "Alice",
  "role": "admin",
  "org": { "id": "org_001", "name": "MyOrg" },
  "api_keys": [
    { "id": "key_001", "key_prefix": "ultr_a1b2", "name": "my-key", "status": "active", "last_used_at": "...", "created_at": "..." }
  ]
}
```

---

## 6. 安全设计

| 措施 | 实现 |
|------|------|
| API Key 不可逆存储 | SHA-256 hash，明文仅创建时返回一次 |
| 密码哈希 | argon2id，m=19456, t=2, p=1 |
| JWT 签名 | HS256，secret 从环境变量 `JWT_SECRET` |
| JWT 过期 | access_token 1h，refresh_token 30d |
| JWT 标准 claims | sub（user_id），org_id（自定义），role（自定义），iat，jti（UUID v7），iss="ultralisk-auth"，exp |
| Refresh token 轮换 | 每次使用后替换旧 token |
| 登录爆破防护 | 同一 email 连续 5 次失败 → 锁定 15 分钟（内存计数器，统计 per-email 失败次数） |
| Key 吊销 | UPDATE status='revoked'，Gateway 侧 Redis 缓存 TTL 60s |
| 请求 body 限制 | 10KB |

---

## 7. 端点总览

| 方法 | 路径 | 认证 | 描述 |
|------|------|------|------|
| POST | `/validate-key` | 无 | Gateway 验证 API Key |
| POST | `/login` | 无 | Console UI 登录 |
| POST | `/refresh` | 无 | 刷新 JWT |
| POST | `/keys` | JWT | 创建/吊销 API Key |
| GET | `/me` | JWT | 当前用户信息 |
| GET | `/health` | 无 | 存活检查 |
| GET | `/metrics` | 无 | Prometheus |

---

## 8. 配置

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `AUTH_PORT` | `3101` | 监听端口 |
| `DATABASE_URL` | - | **必需**。PostgreSQL 连接 |
| `JWT_SECRET` | - | **必需**。JWT 签名密钥 |
| `LOG_LEVEL` | `info` | tracing 级别 (RUST_LOG) |

---

## 9. Phase 1 不做

| 项目 | 何时做 |
|------|--------|
| Pub/Sub Key 吊销 | Phase 2 |
| SSO/SAML 集成 | Phase 3 |
| TOTP 两步验证 | Phase 3 |
| 邀请成员流程 | Phase 2 |
| Redis 缓存层（Auth Service 自身） | Phase 2（Gateway 已做） |
| refresh_token 持久化表 | Phase 1 内存存储 |
| 多实例部署 | Phase 2 |

---

## 10. 开放问题

1. **seed 数据**：Phase 1 需要 migration 里预置测试用户和 API Key 吗？（方便 Gateway 联调）
2. **quota_limits 校验**：创建 Key 时的 quota_limits 需要 Auth Service 校验模型是否存在吗？还是透传？
