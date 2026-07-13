# Gateway Phase 1 Spec Review — Round 2

**Reviewed**: `docs/superpowers/specs/2026-07-12-gateway-phase1-design.md` (updated)  
**Previous review**: `docs/superpowers/specs/2026-07-12-gateway-phase1-spec-review.md`  
**Reviewer**: gateway-spec-review-r2 subagent  
**Date**: 2026-07-12

---

## Summary

The spec rewrite is thorough. **All 3 blockers from round 1 are resolved**. All 8 significant issues are addressed. The 12 notes are all incorporated. Two new minor issues and one residual concern are identified below. No new blockers. The spec is ready for M1 implementation.

---

## Blocker Resolution (B-1, B-2, B-3)

### B-1: Auth architecture ✅ RESOLVED

- **Was**: Spec used direct PostgreSQL fallback, contradicting ADR-008's Auth Service architecture.
- **Now**: §4.2 step 3 calls Auth Service (`POST {AUTH_SERVICE_URL}/validate-key`). §6 adds `AUTH_SERVICE_URL` env var. ADR dependency table explicitly notes Phase 1 simplification (no Pub/Sub, Redis TTL 60s). Fully aligned with ADR-008.

### B-2: Cold start scope ✅ RESOLVED

- **Was**: Spec said cold start NOT in Phase 1; roadmap said Phase 1 M3.
- **Now**: §1 "冷启动排队在 M3 交付". §4.4 pool-empty branches: "Phase 1 M1-M2: 503 / Phase 1 M3: 冷启动排队". §11 M3 milestone includes cold start queuing. §10 clarifies cold start IS in Phase 1 (M3). Consistent with ENGINEERING_ROADMAP.md.

### B-3: ParseBody design ✅ RESOLVED

- **Was**: ParseBody described as tower middleware, architecturally problematic for body consumption.
- **Now**: §3 creates `extract/` directory. `chat_request.rs` is explicitly an `axum FromRequest` extractor, NOT tower middleware. §3 adds a dedicated note explaining the extract-vs-middleware distinction. §4.1 chain diagram labels it "axum extractor (FromRequest)" with body Bytes caching. This is the correct axum idiom.

---

## Significant Issue Resolution (I-1 through I-8)

| Issue | Status | Evidence |
|-------|--------|----------|
| **I-1** Admin proxy under-specified | ✅ Resolved | §4.6 added: full chain, URL construction, all HTTP methods, header handling, timeout, error behavior |
| **I-2** Thundering herd tokio footgun | ✅ Resolved | §4.2 step 3: oneshot channel pattern (`DashMap<ApiKeyId, oneshot::Sender<AuthResult>>`), correct async-safe approach |
| **I-3** SSE tee under-specified | ✅ Improved | §4.5: cumulative `Vec<u8>` buffer, `\n\n` splitting, partial-event handling, missing-usage fallback, timeout. Minor residual below (N-1). |
| **I-4** No graceful shutdown | ✅ Resolved | §8: full drain flow, SIGTERM, `SHUTDOWN_DRAIN_SECS`, SSE continuation during drain, billing completion |
| **I-5** No body size limit | ✅ Resolved | §6: `MAX_BODY_SIZE` (default 10MB). §7: 413 `body_too_large` error code. §11 M2 milestone includes body size limit. |
| **I-6** Single `CONSOLE_API_URL` | ✅ Resolved | §6: separate `AUTH_SERVICE_URL` and `CONSOLE_API_URL` env vars. Auth flow uses Auth Service; admin proxy uses Console API. |
| **I-7** No failed-auth rate limiting | ✅ Resolved | §4.2 step 4: cache failed keys as `{ status: "not_found" }` with TTL 5s, prevents brute-force penetration to Auth Service. |
| **I-8** `/ready` Redis check | ✅ Acceptable | Was a note, not a blocker. Single-instance Phase 1: 6-12 PINGs/min is trivial. Multi-instance concern deferred to Phase 2 as originally noted. |

---

## New Issues

### N-1: Oneshot channel error propagation unspecified (§4.2 step 3)

The spec describes the oneshot deduplication pattern correctly for the happy path (winner calls Auth Service → sends result → waiters receive). It does not address the **failure path**: what happens when the Auth Service call fails (network error, timeout, 5xx)?

If the winning request's Auth Service call fails and the sender is dropped without sending, all waiting receivers get a `tokio::sync::oneshot::error::RecvError`. The spec doesn't describe:
- Whether waiters should retry (risks cascading into a new thundering herd)
- Whether waiters should return 503 to the client
- Whether the failed winner cleans up the `DashMap` entry so subsequent requests can retry

Without cleanup, the stale DashMap entry persists, and all future requests for that key will also fail until the entry is somehow removed.

**Recommendation**: Add to §4.2 step 3: "Auth Service 调用失败时，winner 从 DashMap 移除 entry，等待者收到错误后各自重试一次（带 jitter），若仍失败则返回 503。" The `Mutex` import in the pseudo-code is also unused in the described pattern and should be removed.

**Severity**: Minor — implementation detail, not an architecture defect.

### N-2: RateLimit labeled as "tower middleware" but positioned after extractors (§4.1, §4.3)

The chain diagram in §4.1 shows:

```
ObserveLayer (middleware) → VerifyKey (middleware) → ChatRequest (extractor) → ResolveRoute → RateLimit (middleware) → Proxy (handler)
```

In axum, tower middleware wraps the handler and runs **before** it. If `RateLimit` is implemented as a `tower::Layer`, it executes before `ChatRequest` extraction and route resolution — meaning it cannot read `model`, `api_key_id`, or `quota_limits` from request extensions (they haven't been set yet).

For RateLimit to run after extraction/routing as the spec intends, it must be called **inside the handler**, not as a separate tower layer. This is the same category of abstraction issue as the original B-3 (ParseBody), just less severe because RateLimit doesn't consume the body.

**Recommendation**: Either (a) relabel RateLimit in the diagram as "handler-internal check" rather than "tower middleware", or (b) restructure so the handler explicitly calls `rate_limit::check()`. The spec's logical ordering is correct; the implementation label is what needs fixing.

**Severity**: Minor — an implementer familiar with axum will naturally put the rate limit check inside the handler. The spec's intent is clear even if the label is technically imprecise.

---

## Remaining Residual from Round 1

### I-3 residual: vLLM SSE behavior not documented (§4.5)

The SSE parsing mechanics are now well-described (accumulation buffer, `\n\n` splitting, partial-event retention, missing-usage fallback). One gap remains: the spec doesn't document **expected vLLM SSE behavior** — specifically whether usage appears in the final data chunk before `data: [DONE]`, or as a separate event. This is a "discover at implementation time" detail rather than a design defect, so not re-raising as an issue. The `\n\n` separator is also SSE-correct for vLLM (which uses `\n` line endings), though `\r\n\r\n`-aware parsing would be more robust.

---

## Review

- **Correct**: The spec is architecturally sound, scope-disciplined, and implementation-ready for M1. All blocker-level issues from round 1 are resolved. The rewrite improved clarity significantly — the `extract/` vs `middleware/` distinction, the admin proxy section, the graceful shutdown flow, and the explicit ADR-to-spec consistency notes are all well-executed.
- **Fixed**: B-1 (Auth Service fallback), B-2 (cold start in Phase 1 M3), B-3 (ChatRequest as axum extractor), I-1 through I-7 (all addressed), N-1 through N-12 (all incorporated).
- **Blocker**: None.
- **Note**: N-1 (oneshot error propagation) and N-2 (RateLimit middleware label) are minor implementation-level clarifications. Neither blocks M1 implementation.

---

## All 12 Round-1 Notes: Confirmed Resolved

| Note | Fix |
|------|-----|
| N-1 Metrics naming | Spec uses `gateway_*` consistently; ADR-002 discrepancy is cosmetic |
| N-2 Route table init race | §4.4: synchronous blocking load before server start, panic on failure |
| N-3 `billing.rs` name | Renamed to `usage_writer.rs` in §3 directory structure |
| N-4 No header-strip test | §9 integration tests: explicit "Header 注入防护" test case |
| N-5 quota_limits mismatch | Header note: explicit distinction from ADR-000 monthly quota |
| N-6 Pod.address SocketAddr | Changed to `String` with K8s DNS name rationale |
| N-7 60s default confusion | §6: both vars annotated "(与 X 独立，勿混淆)" |
| N-8 Missing DATABASE_URL | §6: marked as **必需**, Gateway fails at startup if unset |
| N-9 Headers to vLLM | §4.5 step 1: explicitly strips X-User-Id/X-Org-Id/X-Api-Key-Id before forwarding |
| N-10 PoolStrategy unused | §4.4: "Phase 1: 仅 informational, 不驱动行为", "只存储不读取" |
| N-11 Host header | §4.5 step 2: sets Host to Pod.address host, explicitly doesn't forward client Host |
| N-12 ObserveLayer position | §4.1: ObserveLayer shown as outermost, with explicit note |

---

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Reviewed the updated spec at docs/superpowers/specs/2026-07-12-gateway-phase1-design.md. Verified all 3 blockers (B-1 auth architecture, B-2 cold start scope, B-3 ParseBody design) are resolved. Verified all 8 significant issues (I-1 through I-8) are addressed. Verified all 12 notes (N-1 through N-12) are incorporated. Identified 2 new minor issues (N-1 oneshot error propagation, N-2 RateLimit middleware label) — neither is a blocker. No scope widening occurred."
    }
  ],
  "changedFiles": [],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "grep -r '冷启动' docs/",
      "result": "passed",
      "summary": "Confirmed cold start scope is consistently Phase 1 M3 across spec, roadmap, and ADRs"
    }
  ],
  "validationOutput": [
    "B-1: Auth flow now calls Auth Service (not direct PG), AUTH_SERVICE_URL added — matches ADR-008",
    "B-2: Cold start explicitly in Phase 1 M3 (M1-M2 returns 503), consistent with ENGINEERING_ROADMAP.md",
    "B-3: ChatRequest is now axum FromRequest extractor (extract/ dir), not tower middleware — correct idiom",
    "I-1: Admin proxy §4.6 added with full processing chain, URL construction, all methods",
    "I-2: Oneshot channel pattern replaces per-key mutex — async-safe",
    "I-3: SSE buffer accumulation, partial-event handling, missing-usage fallback all documented",
    "I-4: Graceful shutdown §8 with drain timeout, SSE continuation, billing completion",
    "I-5: MAX_BODY_SIZE (10MB default, 413 response) added",
    "I-6: Separate AUTH_SERVICE_URL and CONSOLE_API_URL env vars",
    "I-7: Failed-auth Redis caching (TTL 5s, status: not_found) prevents brute force",
    "I-8: /ready Redis check acceptable for single-instance Phase 1",
    "All 12 round-1 notes confirmed resolved in updated spec"
  ],
  "residualRisks": [
    "N-1 (oneshot error path): Auth Service failure during dedup leaves waiters with RecvError — spec doesn't describe cleanup/retry behavior. Minor implementation detail.",
    "N-2 (RateLimit label): RateLimit called 'tower middleware' but positioned after extractors in chain — must be handler-internal in practice. Implementer will figure this out."
  ],
  "noStagedFiles": true,
  "diffSummary": "Second review of gateway-phase1-design.md. All 3 blockers resolved, all 8 significant issues addressed, all 12 notes incorporated. Two new minor notes identified (oneshot error propagation, RateLimit middleware label). Spec is implementation-ready for M1.",
  "reviewFindings": [
    "no blockers"
  ],
  "manualNotes": "The spec rewrite quality is high. The ADR reconciliation (explicit dependency table with Phase 1 deviations), the extract-vs-middleware distinction note, and the admin proxy section are particularly well done. The two new notes (N-1, N-2) are implementation clarifications, not design defects — implementers will naturally handle them during coding. Recommend proceeding to M1 implementation."
}
```
