# ADR-008: 认证方案

**日期**: 2026-07-11  
**状态**: accepted  
**依赖**: ADR-000（Platform Object Model）、ADR-002（Gateway）、ADR-006（数据存储）

> **对象定位**: Auth Service 管理 APIKey 和组织（Organization/Member）对象的生命周期。Gateway 的 authenticate middleware 验证 APIKey 对象并注入 user context 到 InferenceRequest。

---

## Context

Ultralisk 有两类客户端，认证需求不同：

| 客户端 | 协议 | 认证方式 | 典型场景 |
|--------|------|---------|---------|
| **API 调用**（SDK/CLI） | HTTPS + API Key | Bearer Token（API Key） | `openai.OpenAI(api_key="ultr_...")` |
| **Web Console**（浏览器） | HTTPS + Cookie | Session（JWT in HttpOnly Cookie）| 登录控制台管理 |

两者需要统一认证基础设施，但认证路径不同：
- API Key 验证：每个推理请求都经过 Gateway → Auth Service → Redis 缓存，必须 < 1ms
- Web Console 登录：Console API → Auth Service，低频率，可接受 10-50ms

---

## Decision

采用 **双通道认证**，Auth Service 统一实现。

```
┌─────────────────────────────────────────────────┐
│              Auth Service (Rust)                │
│                                                 │
│  POST /auth/validate-key    ← Gateway 调用      │
│  POST /auth/login           ← Console UI 调用   │
│  POST /auth/refresh                             │
│  POST /auth/invite                              │
│  GET  /auth/me                                  │
│  POST /auth/keys            创建/吊销 API Key    │
└──────────────────────┬──────────────────────────┘
                       │
              ┌────────▼────────┐
              │   PostgreSQL    │  users, api_keys (hashed), orgs, invitations
              └─────────────────┘
              ┌────────▼────────┐
              │     Redis       │  API Key 验证缓存（TTL 60s）、rate limit 计数器
              └─────────────────┘
```

### API Key 认证流（推理路径）

```
SDK Client                       Gateway                    Auth Service    Redis
    │                              │                            │             │
    │ Bearer ultr_abc123           │                            │             │
    │─────────────────────────────>│                            │             │
    │                              │ 1. 查 Redis 缓存          │             │
    │                              │───────────────────────────┼────────────>│
    │                              │<─ hit: {user, org, quota}──┼─────────────│
    │                              │                            │             │
    │                              │ (cache miss)               │             │
    │                              │ POST /auth/validate-key    │             │
    │                              │───────────────────────────>│             │
    │                              │                            │ 查 PG       │
    │                              │<── {user_id, org_id,       │             │
    │                              │     role, quota, limit}    │             │
    │                              │                            │             │
    │                              │ 2. 写 Redis 缓存 TTL 60s  │             │
    │                              │───────────────────────────┼────────────>│
    │                              │                            │             │
    │                              │ 3. 注入 header             │             │
    │                              │    X-User-ID: usr_001      │             │
    │                              │    X-Org-ID: org_001       │             │
    │                              │                            │             │
    │                              │ 4. route → Zealot Engine   │             │
```

关键优化：Gateway 的 `authenticate` middleware 先查 Redis，命中直接返回（< 1ms）。miss 才调 Auth Service → PostgreSQL。TTL 60s 平衡一致性和性能。

### Key 吊销与缓存失效

缓存 TTL 60s 引入一个安全窗口：Key 被吊销后，最多 60 秒内 Redis 缓存仍有效，Gateway 不会查 Auth Service。对于员工离职收回 Key、客户报告 Key 泄露等场景，这个窗口在合规和安全审计中不可接受。

**方案**：吊销时主动失效，不等 TTL 过期。

```
Auth Service (收到吊销请求)            Redis              Gateway
    │                                    │                    │
    │ 1. UPDATE api_keys SET             │                    │
    │    state='revoked' (PostgreSQL)    │                    │
    │                                    │                    │
    │ 2. DEL key:{hash}                  │                    │
    │───────────────────────────────────>│ 删除缓存            │
    │                                    │                    │
    │ 3. PUBLISH revocations {hash}     │                    │
    │───────────────────────────────────>│                    │
    │                                    │                    │
    │                                    │ 4. SUBSCRIBE 收到  │
    │                                    │────────────────────>│
    │                                    │                    │ 5. 删除本地缓存
    │                                    │                    │    (如有本地缓存层)
    │                                    │                    │
    │ 结果: Key 吊销后 < 100ms 全局失效  │                    │
```

成本极低——Redis Pub/Sub 是零配置的，不需要额外基础设施。从"最坏情况 60s"变成"接近实时"。

**降级兜底**：Pub/Sub 是 fire-and-forget，无投递保证。Gateway 实例重连时可能错过 PUBLISH 消息，导致信任旧缓存直到 TTL 过期。兜底机制：Auth Service 维护一个单调递增的 `revocation_version`（每次吊销 +1），存储在 Redis 里。Gateway 重连后比对本地版本号，若落后则主动拉取 `[local_version, current_version)` 区间内的完整吊销列表，覆盖重连窗口。成本：每条吊销额外写一个 INCR，Gateway 重连时一次 GET + 可能的批量 DEL。

**Phase 1 简化**：Gateway 单实例时直接 DEL Redis 即可，不需要 Pub/Sub。多实例部署时再加 Pub/Sub。

### Web Console 认证流（管理路径）

```
Browser                          Console API              Auth Service
    │                              │                            │
    │ POST /v1/admin/auth/login    │                            │
    │ { email, password }          │                            │
    │─────────────────────────────>│                            │
    │                              │ POST /auth/login           │
    │                              │───────────────────────────>│
    │                              │                            │ verify password
    │                              │ { jwt, refresh_token }     │ (argon2 hash)
    │                              │<───────────────────────────│
    │ Set-Cookie:                  │                            │
    │  jwt=... (HttpOnly,Secure,   │                            │
    │  SameSite=Strict)            │                            │
    │<─────────────────────────────│                            │
```

Console API 不做认证——它只转发登录请求到 Auth Service，接收 JWT 后设置 cookie。所有后续 Console API 请求由 Gateway 的 JWT 验证中间件处理（和 API Key 验证共用同一 middleware 链）。

---

## Rationale

### 为什么 API Key 放在 header 而非 URL query

- 安全：URL 出现在日志、浏览器历史、referer header
- OpenAI SDK 兼容：`Authorization: Bearer` 是标准用法

### 为什么 API Key 验证在 Gateway 层（不是应用层，不是引擎层）

- **不在应用层**：Gateway 统一入口，所有请求都经过。Console API 不做 API Key 验证，不需要。
- **不在引擎层**：Zealot Pod 收到的是已认证的请求（header 注入 user_id）。引擎的 CPU 周期留给推理，不浪费在验 Key 上。
- **Gateway middleware 是最优位置**：认证和限流在同一层，验证后立刻知道 rate_limit，直接执行限流。

### 为什么 API Key 验证先查 Redis，再 fallback Auth Service

- 热路径优化：每次推理请求都验证。Redis 命中率 > 99%，延迟 < 1ms
- Auth Service + PostgreSQL 是冷路径（cache miss、Key 轮换时），延迟 5-10ms 可接受
- 缓存失败的 Key 也缓存（TTL 5s），防止暴力破解穿透到 Auth Service

### 为什么 Auth Service 用 Rust

- 与 Gateway、Zealot 技术栈统一
- 无 GC tail latency（JWT 签发、API Key 哈希验证都是纯 CPU 计算）
- PostgreSQL 查询用 `sqlx`（编译期 SQL 检查）

### 为什么不直接用 OAuth2/OpenID Connect

- Phase 1 用户群体是开发者，不需要企业 SSO
- API Key 模型对 OpenAI SDK 最友好（零改动）
- 简单 JWT 足够，OAuth2 的 grant types / scopes 过度设计

### 未来扩展路径

Phase 3（企业私有化部署）：
- SSO/SAML 集成：在 Console API 登录流程中集成，Gateway 验证入口不变
- TOTP 两步验证：Auth Service 增加 TOTP 验证步骤
- API Key 细粒度权限：scope 字段（`read`、`write`、模型白名单）

---

## Consequences

**正面：**
- 热路径延迟 < 1ms（Redis 缓存命中）
- 开发者体验好：`openai.OpenAI(api_key="ultr_...")` 零改动
- Gateway 统一入口，认证、限流、路由在同一 middleware 链
- Auth Service 独立服务，Console API 和 Gateway 都调它

**负面：**
- API Key 吊销通过 Redis Pub/Sub 主动失效，窗口 < 100ms，可满足安全审计要求
- API Key 是 Bearer token 明文传输，泄露风险高——需支持 Key 轮换和吊销（已支持）
- 两个认证通道（API Key + JWT）设计上略有冗余，但覆盖不同使用场景

**待跟进：**
- API Key 生成策略：`ultr_` 前缀 + 32 位随机（SHA-256 hash 存储）
- Redis 缓存策略：成功 TTL 60s，失败 TTL 5s（防暴力破解）。吊销通过 Pub/Sub 主动删除，不等 TTL 过期。降级兜底：`revocation_version` 单调计数器，Gateway 重连后比对版本号补拉
- JWT refresh token 的存储和轮换机制
- Auth Service 的部署：独立 Pod，Gateway + Console API 都调它
