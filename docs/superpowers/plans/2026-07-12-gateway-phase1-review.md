# Gateway Phase 1 Plan Review

**Reviewed**: `docs/superpowers/plans/2026-07-12-gateway-phase1.md` vs `docs/superpowers/specs/2026-07-12-gateway-phase1-design.md`
**Date**: 2026-07-12

---

## Review

### Blocker: oneshot dedup pattern is structurally broken (Task 3, auth.rs lines ~290-300)

The `InflightMap` stores `oneshot::Sender`, but waiters need the receiver. Two problems:

1. `oneshot::Sender` does not implement `Clone`, so `entry.value().clone()` won't compile.
2. The fallback `oneshot::channel().1` creates a brand-new empty receiver that will never receive a value — every waiter would hang until timeout.

The plan's own comments acknowledge this: *"Actually, we need to store the receiver, not the sender..."* but punt resolution to implementation.

**Fix required**: Use `broadcast` channel, or store a `Mutex<Option<oneshot::Receiver>>` per key, or restructure inflight tracking to store receivers. This must be resolved before coding Task 3.

---

### Blocker: SSE streaming ignores the spec's cumulative buffer requirement (Task 11, chat.rs)

Spec §4.5 explicitly mandates a cumulative buffer approach:

> 每次 read 追加到缓冲区 → 查找 "\n\n" (SSE 事件分隔符) → 提取完整事件 → 写入客户端
> 为什么需要累积缓冲区：SSE 的 data: 行可能跨 TCP 帧

The plan's `handle_chat_stream` uses `reqwest`'s `bytes_stream()` with per-chunk `filter_map`, processing each TCP chunk in isolation. A single SSE event split across two TCP frames will produce two partial chunks, neither containing valid JSON for usage extraction. This will silently lose usage data and potentially corrupt client responses.

**Fix required**: Implement the cumulative buffer (`Vec<u8>` append → search `\n\n` → extract → forward → retain remainder) exactly as the spec describes. The current per-chunk approach is not a simplification; it's incorrect.

---

### Blocker: Router state wiring is incomplete (Task 9, app.rs)

`chat_handler` declares three state extractors:
- `State(proxy_state): State<ProxyState>`
- `State(redis_conn): State<MultiplexedConnection>`
- `Extension(auth): Extension<AuthResult>`

But `build()` never calls `.with_state()` on the Router for `ProxyState` or `MultiplexedConnection`. The `AuthResult` extension comes from middleware, which is fine, but `State<T>` extractors require the Router to hold that state. The code will not compile as written.

**Fix required**: Add `.with_state(proxy_state)` and `.with_state(redis_conn)` to the chat router, or restructure the handler to accept them differently (e.g., pass through a combined `AppState` struct that holds both).

---

### Note: Auth oneshot failure path diverges from spec resilience design (Task 3, auth.rs)

Spec §4.2:

> winner 失败时 → 从 DashMap 移除 entry → drop sender
> 等待者收到 RecvError → 各自重试一次（带随机 jitter, 100-500ms）
> 重试仍失败 → 返回 503

The plan's `get_or_wait_for_auth_service` sends `Err(result)` through the channel instead of dropping the sender. This means waiters receive `Err` (not `RecvError`), propagate it immediately without retry, and never get the jittered second chance.

**Impact**: If Auth Service has a transient blip (not rare in real deployments), all concurrent requests for a key fail immediately instead of one retrying after jitter. The plan's approach is simpler but less resilient than the spec's design.

---

### Note: Missing unit tests for auth middleware (spec §9 → no plan task)

Spec §9 lists required unit tests for `middleware/auth.rs`: API Key parse, Redis cache hit/miss/revoked/not_found, Auth Service fallback. The plan has zero unit tests for this module — the only test-related step in Task 3 is `cargo check`.

**Impact**: Auth is the security boundary. Untested auth code is a risk. This should be a dedicated step in Task 3 (or a follow-on task before Task 9 assembly).

---

### Note: Rate limiter unit tests don't cover the sliding window algorithm (Task 5, rate_limit.rs)

Spec §9 requires: "滑动窗口算法（mock Redis）". Task 5's tests only cover `estimate_tokens()` — a simple arithmetic helper. The actual `check()` function (ZREMRANGEBYSCORE + ZRANGEBYSCORE + ZADD) is untested.

**Impact**: The sliding window logic is the second most complex algorithm in Phase 1 (after SSE buffering). Without mock Redis tests, correctness can't be verified without a live Redis instance.

---

### Note: Rate limiting window is hardcoded, not configurable (Task 9, app.rs)

The `chat_handler` passes literal `60` for `window_secs`, with the comment `// TODO: use AppConfig`. The spec defines `RATE_LIMIT_WINDOW_SECS` as an env var (default 60) in `AppConfig`, but it's never plumbed through to `rate_limit::check()`.

**Fix**: Either pass `AppConfig` into the handler or extract the value and pass it.

---

### Note: Missing observability metrics — only 2 of 9 spec metrics implemented (Task 8 vs spec §4.8)

Spec §4.8 defines:

| Metric | Implemented? |
|--------|-------------|
| `gateway_requests_total` | ✓ (Task 8) |
| `gateway_request_duration_seconds` | ✓ (Task 8) |
| `gateway_upstream_requests_total` | ✗ |
| `gateway_upstream_duration_seconds` | ✗ |
| `gateway_tokens_total` | ✗ |
| `gateway_cancelled_without_usage_total` | ✗ |
| `gateway_missing_usage_total` | ✗ |
| `gateway_usage_write_errors_total` | ✓ (Task 12, usage_writer.rs) |
| `gateway_auth_failures_total` | ✗ |

No task covers adding upstream/token/cancellation metrics to the proxy, auth, or usage modules. These need to be instrumented in their respective modules, not just in the observe middleware.

---

### Note: Missing cancellation handling (spec §4.5 → no task)

Spec §4.5 describes the client-disconnect-during-stream case:

> 客户端断开连接 → 上游请求被 cancel → 如果未收到 final usage → 丢失本次 usage 计数
> → 记录 metrics: gateway_cancelled_without_usage_total{model}

No task implements this. The SSE code in Task 11 has no drop/cancel detection on the client connection.

---

### Note: Missing "stream ended without usage" handling (spec §4.5 → no task)

Spec §4.5:

> 如果流结束但未收到 usage → 记录 error log + gateway_missing_usage_total{model}

No task covers this. The SSE code in Task 11 doesn't track whether usage was received by stream end.

---

### Note: Missing LOG_LEVEL config (Task 1, config.rs)

Spec §6 lists `LOG_LEVEL` as a configurable env var (default `info`). The plan's `main.rs` uses `EnvFilter::try_from_default_env()` which reads `RUST_LOG` instead. Minor inconsistency — functionally similar but deviates from documented config surface.

---

### Note: PoolStrategy uses String instead of enum (Task 2, route/table.rs)

Spec §4.4 defines `PoolStrategy` as a Rust enum with `Serverless | Batch | Reserved | Dedicated` variants. Plan stores `strategy: String`. Both are informational-only in Phase 1, so no functional impact, but deviates from the spec type definition.

---

### Note: Integration tests are all unimplemented placeholders (Task 10 + Task 14)

All 7 integration test functions contain only `assert!(true)` or TODO comments. Task 14 describes what to implement but provides no code — it's a task outline, not an implementation. The spec's test strategy (§9) requires real tests for: full chat pipeline, rate limiting, auth failures, route 404, header injection protection, and admin proxy (GET/POST/DELETE). None of these are implemented in the plan.

---

### Correct: Middleware/extractor ordering matches spec

Despite the spec's own internal inconsistency (spec §3 puts rate_limit in `middleware/` but spec §4.1 shows it after route resolution), the plan correctly places rate limiting as a handler-internal call after auth and route resolution. The processing order is: observe → body_limit → auth → ChatRequest extractor → handler(resolve → rate_limit → proxy). This exactly matches the lifecycle diagram in spec §4.1. ✓

### Correct: All spec features have at least a skeleton task

Every spec feature from §3-§8 maps to at least one task in the plan. The 16 tasks span project scaffold through documentation. Gaps are in implementation depth (tests, SSE buffering, observability), not missing top-level tasks. ✓

### Correct: Task dependency ordering is sound

Tasks follow dependency order (Task 2 route table before Task 9 app assembly; Task 11 SSE before Task 12 usage writer wiring). No circular dependencies. No task depends on output from a later task. ✓

### Correct: Admin proxy correctly skips ChatRequest extraction

Task 7's `handle_admin` takes a raw `Request` (not `ChatRequestExtractor`), matching the spec's requirement in §4.6 that admin requests bypass body parsing and routing. ✓

---

## Structured acceptance report

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Review is scoped to the plan vs spec comparison. No scope-widening edits were made. All findings are directly traceable to mismatches between the two documents."
    }
  ],
  "changedFiles": [
    "docs/superpowers/plans/2026-07-12-gateway-phase1-review.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "git status --short",
      "result": "passed",
      "summary": "Confirmed gateway/ directory does not exist yet; this is a pre-implementation review"
    }
  ],
  "validationOutput": [
    "3 blockers found (oneshot pattern, SSE buffering, Router state wiring)",
    "9 notes/warnings found (auth retry divergence, missing tests, incomplete metrics, hardcoded window, cancellation gap, missing-usage gap, LOG_LEVEL mismatch, String-vs-enum, placeholder integration tests)",
    "4 areas confirmed correct (middleware ordering, task coverage, dependency ordering, admin proxy design)",
    "No staged files — gateway/ does not exist yet"
  ],
  "residualRisks": [
    "SSE cumulative buffer: if left unfixed, usage extraction will silently fail on any SSE event that spans TCP frames (common in practice)",
    "Oneshot dedup: if left unfixed, concurrent auth requests under cache miss will either not compile or hang",
    "Router state: if left unfixed, app won't compile — this is a showstopper for Task 9",
    "Integration tests: all placeholder-only means M1 acceptance criteria ('curl → Gateway → mock vLLM → 响应跑通') can't be verified automatically without additional implementation work"
  ],
  "noStagedFiles": true,
  "diffSummary": "Created review document only. No code changes. gateway/ directory does not exist yet.",
  "reviewFindings": [
    "blocker: Task 3 auth.rs oneshot pattern stores Sender, waiters need Receiver — will not compile or will hang",
    "blocker: Task 11 SSE streaming uses per-chunk filter_map instead of spec's cumulative buffer — will lose usage on frame-split events",
    "blocker: Task 9 app.rs Router missing .with_state() for ProxyState and MultiplexedConnection — will not compile",
    "note: Task 3 auth oneshot error path sends Err through channel instead of dropping sender — removes spec's jittered-retry resilience",
    "note: No unit tests for middleware/auth.rs (spec §9 requires API Key parse, cache hit/miss/revoked/not_found, Auth Service fallback)",
    "note: Task 5 rate_limit tests only cover estimate_tokens(), not the actual check() sliding window algorithm",
    "note: Task 9 chat_handler hardcodes window_secs=60 with TODO comment instead of reading AppConfig.rate_limit_window_secs",
    "note: 6 of 9 spec-defined Prometheus metrics have no implementation task (upstream, tokens, cancellation, missing usage, auth failures)",
    "note: Spec §4.5 cancellation handling (client disconnect mid-stream → gateway_cancelled_without_usage_total) has no task",
    "note: Spec §4.5 'stream ended without usage' handling (gateway_missing_usage_total) has no task",
    "note: Task 1 config.rs uses RUST_LOG not spec's LOG_LEVEL env var",
    "note: Task 2 route/table.rs uses strategy: String instead of spec's PoolStrategy enum",
    "note: Tasks 10+14 integration tests are all assert!(true) placeholders — no real test implementations"
  ],
  "manualNotes": "The spec itself has an internal inconsistency: §3 puts rate_limit.rs under middleware/ but §4.1 shows RateLimit after ResolveRoute (which is handler-internal, not middleware). The plan correctly resolves this by making rate_limit a handler-internal call, not a tower middleware. The spec directory tree should be updated to match."
}
```
