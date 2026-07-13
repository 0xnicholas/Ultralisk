# Gateway Phase 1 Spec Review

**Reviewed**: `docs/superpowers/specs/2026-07-12-gateway-phase1-design.md`  
**Reviewer**: gateway-spec-review subagent  
**Date**: 2026-07-12  
**Cross-referenced**: ADR-000, ADR-001, ADR-002, ADR-003, ADR-004, ADR-005, ADR-006, ADR-007, ADR-008, ADR-010, architecture.md, roadmap.md, ENGINEERING_ROADMAP.md

---

## Summary

The spec is well-structured and demonstrates clear thinking about middleware ordering (Route before RateLimit is a good and well-justified decision). The Phase 1 scope discipline is mostly clean. However, there are **3 blockers**, **8 significant issues**, and **12 notes** across architecture, implementation feasibility, security, and consistency.

---

## Review

### Correct (what's already good)

- **Route-before-RateLimit ordering** (§4.1): Well-justified. Putting route resolution ahead of rate limiting prevents 404/503 requests from consuming Redis quota counters. This is a non-obvious optimization that's correctly reasoned.
- **Header stripping in auth** (§4.2 step 0): Removing `X-User-Id`, `X-Org-Id`, `X-Api-Key-Id` from incoming requests before injecting trusted values is the correct defense against client header forgery. This is a concrete, specific security measure.
- **Per-key mutex for PG fallback** (§4.2 step 3): Recognizing and addressing the thundering herd problem on cache miss is excellent design thinking. Per-key granularity (not global lock) is the right tradeoff.
- **Billing upsert semantics** (§4.6): Using `request_id` as primary key with upsert (not insert) correctly handles the late-arriving final usage scenario described in ADR-002 and ADR-006.
- **Cancelled-without-usage metric** (§4.5): `gateway_cancelled_without_usage_total` is a smart monitoring hook. It directly addresses the abuse vector of clients disconnecting mid-generation to avoid billing.
- **Phase 1 scope discipline** (§9): The "explicitly NOT doing" table is clear, specific, and ties each exclusion to a rationale and a target phase. This is the best scope-creep defense in the document.
- **`PoolStrategy` enum forward-compatibility** (§4.4): Including `Reserved` and `Dedicated` variants with comments marking them as Phase 2/3 is correct — prevents a breaking schema change later.
- **Open questions section** (§11): Acknowledging unknowns rather than papering over them is honest engineering practice. The vLLM unavailability question is particularly pragmatic.

---

### Blocker: Critical issues that must be resolved before proceeding

#### B-1: Auth architecture contradicts ADR-008 (§4.2 vs ADR-008)

The spec §4.2 step 3 says Gateway queries **PostgreSQL directly** as a fallback when Redis misses:

> "缓存未命中 → 查 PostgreSQL (fallback) → 写入 Redis (TTL: 60s)"

ADR-008 explicitly describes a different architecture: Gateway **calls Auth Service**, which then queries PostgreSQL:

```
ADR-008 §Decision:
  Gateway → Redis (hot path, <1ms)
  Redis miss → POST /auth/validate-key → Auth Service → PostgreSQL
```

The spec's direct-PG approach is incompatible with ADR-008 for multiple reasons:
1. Auth Service is scoped to manage API Key lifecycle, rotation, and revocation logic. Bypassing it means Gateway must duplicate key validation logic.
2. ADR-008's Pub/Sub revocation scheme (§Key 吊销与缓存失效) requires Auth Service to be the revocation authority, publishing revocations that Gateway subscribes to. Direct PG access breaks this model.
3. ADR-008 explicitly delegates key format decisions to Auth Service ("API Key 生成策略：`ultr_` 前缀 + 32 位随机（SHA-256 hash 存储）"). Direct PG access means Gateway must know the hash scheme.

**Resolution required**: Either (a) align the spec with ADR-008 by adding an `AUTH_SERVICE_URL` config and changing the fallback path to call Auth Service, or (b) file an ADR amendment documenting why Gateway queries PG directly and how revocation/validation consistency is maintained.

#### B-2: Cold start queuing scope contradicts engineering roadmap (§9 vs ENGINEERING_ROADMAP.md M3)

The spec §9 table says cold start queuing is explicitly NOT in Phase 1:

> | 冷启动排队 | Phase 1 M3 | 需要 KAI Scheduler 集成，M1 还没部署 |

But ENGINEERING_ROADMAP.md places cold start queuing in Phase 1 M3:

> **M3 — 冷启动 + 整合测试（第 3 月末）**
> | **Gateway** | 冷启动排队：model 不在 GPU→Gateway 排队→KAI 分配 GPU→加载模型→返回 |

The roadmap also mentions Phase 1 acceptance criteria that imply cold start:

> | 验证 | 冷启动：第一个请求排队 2-5min，后续秒级返回 |

This is a direct contradiction. If cold start is Phase 2 per the spec, then the roadmap's M3 milestone and acceptance criteria are wrong. If cold start is Phase 1 M3 per the roadmap, then the spec's §9 table and §4.4 comment ("Phase 2: 冷启动排队") are wrong.

**Resolution required**: Decide which document is authoritative and update the other. The spec's §4.4 also says "pool 空：503 (Phase 1: 直接 503; Phase 2: 冷启动排队)" — this needs to be consistent with the decision.

#### B-3: ParseBody as tower middleware is architecturally problematic (§4.1, §4.3 vs axum/tower model)

The spec places ParseBody as a middleware layer that parses `ChatRequest` from the request body and stores it in extensions. However, tower middleware **cannot easily consume the request body** because:

1. `http::Request<Body>` where `Body` is a `Stream` — reading it consumes it. axum's `FromRequest` extractor can do this, but a `tower::Layer` wrapping `tower::Service` sees the request as an opaque `http::Request`.
2. For SSE streaming, the Proxy layer needs the **raw body bytes** to forward to vLLM. If ParseBody consumes the body via `serde_json::from_slice`, the raw bytes are lost unless explicitly cached.
3. The idiomatic axum approach would be an **extractor** (implementing `FromRequest`) that parses the body, stores the parsed struct in extensions, and caches the raw `Bytes` for downstream forwarding. This is not a middleware — it's an extractor that runs at the service/handler level.

The spec's middleware chain diagram (§4.1) conflates tower middleware layers with axum extractors. This matters because:
- Middleware wraps the service and runs before/after it
- Extractors run inside the service handler and consume the request body
- ParseBody must be an extractor (or a special layer that buffers the body), not a plain middleware

This isn't a showstopper — it can be implemented — but the spec's abstraction is misleading and will cause implementation confusion.

**Resolution required**: Either (a) redesign ParseBody as an axum extractor (not middleware) and update the chain diagram, or (b) document the specific mechanism for body buffering (e.g., `axum::body::Bytes`, `axum::extract::Body` with `to_bytes()`) and how raw bytes are preserved for the Proxy layer.

---

### Significant Issues

#### I-1: `/v1/admin/*` proxy path is completely under-specified (§5)

The spec mentions `POST /v1/admin/*` routes to Console API but provides zero detail:
- Does it go through the same middleware chain (auth, parse_body, rate_limit, route)?
- If not, what chain does it use?
- Does ParseBody apply to admin requests? (They won't have a `model` field)
- How is the upstream URL constructed? `CONSOLE_API_URL + original_path`? Is there path stripping?
- What about non-POST admin methods (GET, PUT, DELETE)?
- Does admin proxy also strip client-injected headers?

This is the second half of the Gateway's routing responsibility and it's essentially a TODO in a spec that's otherwise detailed. The lack of clarity here means the `/v1/admin/*` path cannot be implemented from this spec alone.

**Recommendation**: Add an Admin Proxy section (§4.x) covering: middleware chain (likely auth-only for JWT/Cookie, or passthrough), URL construction, method passthrough, header handling, and timeout config.

#### I-2: Thundering herd mutex implementation has a tokio footgun (§4.2 step 3)

The spec suggests `DashMap<ApiKeyId, Mutex<()>>` or `tokio::sync::Mutex` per-key for PG fallback deduplication. Both have subtle issues:

- **`DashMap` + `std::sync::Mutex`**: You cannot hold a `std::sync::Mutex` guard across `.await` points (PG query, Redis write). Tokio will detect this in debug mode and panic.
- **`DashMap` + `tokio::sync::Mutex`**: `DashMap::entry()` returns a guard that borrows the map. You cannot hold the entry guard across `.await` — the compiler won't let you.

The correct pattern is something like:

```rust
// 1. Check cache (no lock needed)
// 2. On miss, insert a oneshot channel into a DashMap
// 3. Winner queries PG, loser awaits the oneshot receiver
// 4. Winner sends result through oneshot, then writes to Redis

// OR use a dedicated concurrent map that supports proper async locks:
use tokio::sync::Mutex;
use std::collections::HashMap;
// With a global RwLock<HashMap<...>> wrapping tokio::sync::Mutex entries
```

The spec should be updated to describe the intended async-safe mechanism, or at minimum note this as an implementation hazard.

#### I-3: SSE tee implementation is under-specified (§4.5)

The spec says "同时提取 usage → 写 Raw Usage Event" but the mechanics of the tee are not described:

1. **Chunk boundary problem**: SSE `data:` lines can be split across TCP frames. The "final chunk" containing `usage` might arrive as `{"usage":{"prompt_tokens":100` followed by `,"completion_tokens":500}}` in the next frame. A simple line-by-line parser will fail. The parser must accumulate partial JSON across chunks.

2. **`data: [DONE]` sentinel**: OpenAI-compatible SSE streams end with `data: [DONE]`. Does vLLM include usage in a chunk before `[DONE]`, in a chunk after `[DONE]`, or in the `[DONE]` line itself? The spec should document the expected vLLM behavior.

3. **What if usage never arrives?**: The spec says cancelled-without-usage increments a counter. But what if the stream completes normally but the final chunk is malformed? Is there a timeout for waiting on final usage after stream close?

4. **Non-streaming usage extraction**: For `stream: false`, the spec says "等待完整响应 → 提取 usage". But does the Gateway always forward `stream: true` to vLLM and buffer, or does it forward the client's `stream` flag as-is? This affects the extraction path.

**Recommendation**: Add an SSE parsing subsection covering chunk accumulation, partial JSON handling, timeout for final usage, and non-streaming path behavior.

#### I-4: No graceful shutdown story (§2)

The spec describes a proxy holding long-lived SSE connections (up to minutes for batch/large generations). When the Gateway process receives SIGTERM (deployment, restart, config reload):

- What happens to in-flight SSE connections?
- Does the Gateway drain connections (stop accepting new, wait for existing to finish)?
- Is there a drain timeout after which connections are forcibly closed?
- Does billing still work for connections that complete during drain?

This is a production-readiness concern that should be addressed even in Phase 1 since the Gateway is a critical-path component. The spec mentions `ArcSwap` for graceful reload but that's only for route table updates, not process lifecycle.

**Recommendation**: Add a shutdown/drain section specifying: drain timeout (e.g., 30s), behavior (stop accepting new connections, wait for existing SSE streams to complete or timeout), and interaction with billing during drain.

#### I-5: No request body size limit (§2, §4)

The spec has no maximum request body size. A malicious client can send a multi-GB JSON body to `/v1/chat/completions`:

- axum defaults to no limit on body size
- The Gateway must buffer the entire body in ParseBody before forwarding
- A single large request can exhaust Gateway memory (DoS)

This should be configurable and enforced at the axum level (e.g., `axum::extract::DefaultBodyLimit` or `ContentLengthLimit`).

**Recommendation**: Add a `MAX_BODY_SIZE` config (e.g., 10MB default) and enforce it in the axum Router or as a middleware before ParseBody.

#### I-6: `CONSOLE_API_URL` env var singular but Console API may have multiple endpoints (§6)

The spec has one `CONSOLE_API_URL` for all `/v1/admin/*` traffic. ADR-008 describes a separate Auth Service. ADR-001 shows Auth Service as a peer to Console API. If Auth Service is a separate process (different URL), the spec needs `AUTH_SERVICE_URL` as well — unless the current decision is that the Auth Service endpoint lives under the Console API URL.

This ties back to B-1: the auth architecture needs to be consistent. Either:
- Gateway calls Auth Service directly (needs `AUTH_SERVICE_URL`)
- Console API proxies to Auth Service (needs documenting in admin proxy section)
- Gateway queries PG directly (contradicts ADR-008)

#### I-7: No failed-auth rate limiting (§4.2)

ADR-008 §Rationale explicitly mentions:

> "缓存失败的 Key 也缓存（TTL 5s），防止暴力破解穿透到 Auth Service"

The spec §4.2 does not mention this. Without caching failed auth results, every invalid API key attempt hits the PG fallback path, enabling brute-force enumeration and DoS against the database. The spec should:

1. Cache "key not found" results in Redis with a short TTL (5s per ADR-008)
2. Consider a per-IP or global rate limit on auth failures (independent of per-key-per-model limits)

This is a security concern — a missing defense against a trivial attack.

#### I-8: `/ready` endpoint checks Redis on every call (§5)

The spec says `/ready` checks "Redis 连通 + 路由表至少有一个 entry". If Kubernetes probes `/ready` every 5-10 seconds from each replica, and the Gateway has a single instance, that's 6-12 Redis PINGs/minute. This is low volume and acceptable, but for future multi-instance deployments this scales linearly and should be considered:

- Could use a cached health status (update every N seconds in background) to avoid per-probe Redis calls
- The "路由表至少有一个 entry" check is cheap (local `ArcSwap` read) — fine

**Recommendation**: Note that the Redis check should be lightweight (a simple `PING` command, not a full query) and consider a cached health status for multi-instance deployments.

---

### Notes: Observations, risks, and follow-up items

#### N-1: Metrics naming inconsistency with ADR-002

ADR-002 uses `zealot_gateway_*` prefix for metrics (e.g., `zealot_gateway_requests_total`). The spec uses `gateway_*` prefix (e.g., `gateway_requests_total`). Neither is wrong, but inconsistency across documents causes confusion when implementing dashboards and alerting rules.

#### N-2: Route table initialization race condition

The spec uses `Lazy<ArcSwap<RouteTable>>` as a global static (§4.4). The initial value is an empty `RouteTable`. If a request arrives before the config file is loaded (between process start and config loading), all routes will 404. The spec doesn't describe whether route table loading is synchronous during startup (blocking server start until complete) or asynchronous (server starts with empty table, then loads config).

#### N-3: `billing.rs` module name is misleading

The module described in §4.6 is a raw usage event writer — it writes `raw_usage_events` rows to PostgreSQL. Calling it `billing.rs` suggests billing logic (aggregation, invoicing, balance tracking) that belongs in the Control Plane. Consider `usage_writer.rs` or `raw_usage.rs` for clarity.

#### N-4: No explicit test for header stripping

§8 lists integration tests for auth, rate limit, route, and streaming. It does not test that client-injected `X-User-Id`, `X-Org-Id`, `X-Api-Key-Id` headers are stripped. This is a critical security behavior that should have a dedicated test case.

#### N-5: `quota_limits` key format mismatch between spec and ADR-000

The spec §4.2 says `quota_limits` is `map[model_id → token_limit_per_window]`. ADR-000's APIKey object has `quota: { monthly_token_limit: number | null }` — a single monthly limit, not a per-model map. These are different concepts: the spec describes a per-model per-window rate limit, while ADR-000 describes a monthly aggregate quota. Both are valid, but the spec should clarify that `quota_limits` is a **rate limit** concept (separate from ADR-000's monthly quota) and explain where the per-model limits are stored (Redis? APIKey metadata?).

#### N-6: Pod address type is `SocketAddr` — IPv6?

The spec defines `Pod.address` as `SocketAddr` (§4.4). If vLLM Pods have IPv6 addresses or if the Gateway and vLLM are on different networks, `SocketAddr` may need to be `String` or include DNS resolution capability. For Phase 1 with static config, this is fine, but worth noting for future.

#### N-7: Rate limit window size vs Auth cache TTL both default to 60s

`RATE_LIMIT_WINDOW_SECS` defaults to 60 and `AUTH_CACHE_TTL_SECS` defaults to 60 (§6). These are unrelated but share the same default. If someone changes one expecting it to affect the other, they'll be surprised. Worth adding a comment that these are independent.

#### N-8: Missing `DATABASE_URL` default

All config vars have defaults except `DATABASE_URL` (§6). This is intentional since there's no safe default for PG connection. But the spec should note that `DATABASE_URL` is **required** (Gateway should fail fast at startup if unset), or optional (billing writes silently dropped if unset, for development without PG).

#### N-9: Proxy layer doesn't strip Gateway-injected headers before forwarding to vLLM

The auth layer strips client-injected `X-User-Id`, `X-Org-Id`, `X-Api-Key-Id` and then injects trusted values. The Proxy layer forwards the request to vLLM. If the vLLM backend doesn't need these headers, forwarding them is a minor information leak. The spec should document whether internal headers are stripped before forwarding to the backend, or if they're intentionally passed through (e.g., for logging on the vLLM side).

#### N-10: `PoolStrategy` is stored but never used in Phase 1

The `RouteTable` struct has `Pool.pods`, `Pool.strategy`, and `Pod.weight`. In Phase 1, `strategy` and `weight` are stored but unused (weight defaults to 1, strategy is informational). This is fine for forward compatibility but should be explicitly noted to prevent an implementer from wiring up Batch logic from the strategy field.

#### N-11: No discussion of `Host` header when proxying

When Gateway proxies to vLLM (`http://{pod.address}/v1/chat/completions`), what `Host` header is sent? If the client's original `Host: gateway.ultralisk.io` is forwarded, the vLLM pod may reject it or it may cause confusion in vLLM logs. The Gateway should either strip/replace the Host header with the pod's address, or document that it passes through the original.

#### N-12: Observability layer position in middleware chain

The spec §4.1 shows the processing chain as `VerifyKey → ParseBody → ResolveRoute → RateLimit → Proxy`, with no ObserveLayer shown. §4.7 describes an observe middleware with Prometheus metrics and tracing spans. Where does it sit? Typically, observe wraps the entire chain (outermost layer) to capture total request duration and status codes. The chain diagram should include it.

---

## Appendix: Cross-reference matrix

| Spec Section | Contradicts | Details |
|---|---|---|
| §4.2 Auth fallback | ADR-008 §Decision | Direct PG vs Auth Service call |
| §4.4 Route + §9 Scope | ENGINEERING_ROADMAP.md M3 | Cold start in or out of Phase 1 |
| §4.1 Middleware chain | ADR-002 | ParseBody not in ADR-002 chain, order refinement |
| §4.5 Cancel handling | ADR-002 §流式取消与计费语义 | ADR-002 assumes gRPC cancel, spec uses HTTP cancel for vLLM |
| §4.7 Metrics naming | ADR-002 §Prometheus Metrics | `gateway_*` vs `zealot_gateway_*` |
| §4.2 quota_limits | ADR-000 §APIKey | Per-model rate limit map vs single monthly quota |
| §4.4 PoolStrategy | ADR-005 | ADR-005 says Batch strategy lives in Gateway for Phase 1, but spec marks Batch strategy as Phase 2 scope |

---

## Overall Assessment

The spec is **implementation-ready for the core chat completions path** once the three blockers are resolved. The middleware ordering, auth flow (header stripping, caching strategy), rate limiting algorithm, and billing semantics are well-designed and aligned with the ADRs (except where noted).

The main gaps are: (1) admin proxy is a stub, (2) the auth architecture needs reconciliation with ADR-008, (3) the cold start scope needs alignment with the roadmap, and (4) the ParseBody-as-middleware abstraction needs refinement for implementability.

For a pre-implementation review, the level of detail is appropriate — it's specific enough to guide implementation while leaving room for engineering judgment on exact Rust idioms. The open questions section (§11) is honest and pragmatic.
