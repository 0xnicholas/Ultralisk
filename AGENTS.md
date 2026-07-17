# AGENTS.md — AI Agent Guide for Ultralisk

> Read this first when working on any part of this codebase.

---

## Architecture Summary

Ultralisk is an AI inference cloud platform. Architecture documented in 11 ADRs under `docs/adr/`.

```
Client → Cloud LB → Gateway (Rust) ─┬─ /v1/admin/* → Console API (TypeScript, 管理流量)
                                    └─ /v1/chat/* → Runtime Interface (gRPC)
                                                       → Backend Runtime → vLLM/Zealot → GPU

KAI Scheduler: 仅在部署/扩缩容时被 Backend Runtime.LoadModel() 调用，分配 GPU → 创建 Pod。
              推理请求路径不经过 KAI Scheduler。详见 ADR-004。
```

```
Client → Cloud LB → Gateway (Rust) ─┬─ /v1/admin/* → Console API (管理)
                                    └─ /v1/chat/* → Backend Runtime → vLLM/Zealot → GPU
```

**Three layers**: Gateway (entry routing), Control Plane (management), Data Plane (inference execution).  
**Key constraint**: Gateway routes by request body (`model` field), not URL. Body-based routing is why we didn't use Kong.  
**Data Plane**: vLLM in Phase 1, Zealot (self-built Rust+CUDA) in Phase 2-3. Backend Runtime (ADR-010) provides gRPC-level engine substitution.

Read `docs/adr/000-platform-object-model.md` first — all architecture decisions reference objects defined there.

---

## Project Structure

```
console/                     ← Self-contained monorepo (pnpm workspace)
  ├── console-api/           ← Express API (TypeScript, port 3100, PostgreSQL-backed)
  │     src/index.ts         ← Route wiring — SaaS/Private mode via DEPLOYMENT_MODE env var
  │     src/routes/          ← 22 route modules across shared, SaaS-only, and private-only
  │     src/db/migrate.ts    ← Runs drizzle/*.sql migrations 001-007 on startup
  │     drizzle/             ← SQL migrations 001-007 (Phase 1 + Phase 2 + Phase 3 tables)
  │     src/fixtures.ts      ← Retained for reference; all routes now PG-backed
  │     src/services/        ← auditLog middleware, usageCron, authService client
  ├── console-ui/            ← React SPA (TypeScript, Vite, Mantine v9, React Router v7)
  │     src/App.tsx          ← Routes split by mode (shared + SaaS-only + private-only)
  │     src/utils/deployment.ts ← isSaaS()/isPrivate() mode detection
  │     src/pages/           ← Shared pages (Dashboard, Models, Operations, etc.)
  │     src/saas/            ← SaaS-only pages (Billing, API Keys)
  │     src/private/         ← Private-only pages (Setup Wizard, Audit Logs, Compliance, License, SSO)
  │     src/api/             ← API client modules
  │     src/components/      ← Shared UI components (Sidebar supports mode-based nav)
  │     vite.config.ts       ← Dev proxy + DEPLOYMENT_MODE env var injection
  ├── brand/                 ← Logo SVGs + brand README
  ├── screenshots/           ← Competitor reference screenshots
  ├── package.json           ← turbo + typescript
  ├── turbo.json             ← Turborepo build config
  └── pnpm-workspace.yaml    ← Workspace package definitions

docs/                        ← Architecture documentation (root level)
  ├── adr/                   ← 11 Architecture Decision Records (000-010)
  │     000-platform-object-model.md
  │     001-platform-architecture.md
  │     002-gateway.md
  │     003-inference-engine-vllm.md
  │     004-gpu-scheduler-kai.md
  │     005-deployment-types.md
  │     006-data-storage-strategy.md
  │     007-observability-stack.md
  │     008-authentication-strategy.md
  │     009-zealot-language-strategy.md
  │     010-backend-runtime.md
  ├── architecture.md        ← Full architecture spec (diagrams + all layers)
  ├── roadmap.md             ← Product roadmap (Phase-level)
  ├── ENGINEERING_ROADMAP.md ← Engineering milestones (monthly, per-workstream)
  └── superpowers/           ← Historical planning docs

gateway/                     ← Rust API gateway (default port 8080)
  ├── src/                   ← middleware/ (auth, rate_limit), extract/, proxy/ (SSE), route/, batch.rs, cold_start.rs, route/watcher.rs
  ├── config/route_table.json← model → Pool routing table (weight field for A/B)
  └── tests/                 ← Integration suite (chat, admin, auth, rate limit, route); skips when PG/Redis absent

auth-service/                ← Rust auth service (default port 3101)
  └── src/                   ← login/refresh/keys/validate_key, revocation Pub/Sub, totp module

proto/                       ← Runtime Interface 契约（ADR-010），Gateway + 各 Backend Runtime 共用
  └── runtime/v1/runtime.proto

zealot/                      ← Self-built inference engine (standalone, Rust core + PyO3 bindings — no vLLM fork)
  ├── src/block_manager.rs   ← KV cache block management
  ├── src/constrained_decode/← JSON schema → DFA constrained decoding
  ├── src/scheduler.rs        ← Continuous-batching scheduler (priority queue + block budget + OOM preemption)
  ├── src/engine.rs           ← Engine step loop + ModelRunner trait
  ├── src/model_runner_py.rs  ← PyModelRunner: PyO3-embedded torch CPU forward (dev-mode)
  ├── src/bin/zealot-backend.rs ← Runtime Interface gRPC server, Engine actor (:9091)
  ├── build.rs               ← tonic-build for ../proto (vendored protoc)
  └── docs/architecture.md   ← Engine design doc

.gitignore                   ← Root-level, also covers console/ paths

.gitignore                   ← Root-level, also covers console/ paths
```

---

## Tech Stack

| Layer | Tech | Notes |
|-------|------|-------|
| Gateway | **Rust** (`gateway/`) | Implemented. `tower` middleware, body-based routing. NOT Kong. |
| Auth Service | **Rust** (`auth-service/`) | Login/JWT/API keys, key revocation via Pub/Sub |
| Console API | **TypeScript + Express 5** | PostgreSQL-backed (drizzle SQL migrations). Invitations/gpu-utilization/cost-analytics still mock. |
| Console UI | **React 19 + TypeScript + Mantine v9** | Vite dev server proxies to :3100 |
| Inference | **vLLM** (Phase 1) → **Zealot** (Rust+CUDA, Phase 2+) | Zealot is standalone (no fork); Block Manager / Constrained Decode / Scheduler replaced in Rust |
| Container | **Kubernetes + KAI Scheduler** | GPU-aware Pod scheduling |
| DB | **PostgreSQL + Redis + ClickHouse + Loki + S3** | Domain-driven: Control/Cache/Telemetry/Artifact. Model weights/LoRA go to S3, not Postgres. |
| Build | **pnpm + Turborepo** | Workspace root: `console/` |

---

## Key Constraints (do NOT violate)

1. **Gateway is body-based routing**. Never write code that assumes URL-based routing (no Kong/nginx-style path matching for inference)
2. **vLLM Backend ignores SchedulingHint in Phase 1**. Batch vs Serverless differentiation is Gateway-side (aggregation window), not engine-side. GPU Pools must be separate.
3. **Billing uses request_id upsert**. Raw Usage Event table: `request_id` primary key, upsert semantics, never INSERT-only
4. **Aggregated Usage runs T-2**. Hourly cron aggregates the hour-before-last, not the hour-just-ended (watermark for late final responses)
5. **KAI Scheduler is cluster resource scheduler only**. It never handles inference request routing. That's Gateway's job.
6. **Key revocation uses Pub/Sub + revocation_version fallback**. Never just TTL-expire. Multi-instance Gateway must re-pull on reconnect.
7. **Policy Engine outputs ExecutionPlan**. Scheduler consumes it blindly. Never put Serverless/Batch/Dedicated logic in the Scheduler.

---

## Working With This Codebase

### CI

`.github/workflows/ci.yml` runs on every PR and push to main:

- **console job** — `pnpm lint && pnpm typecheck && pnpm test && pnpm build` from `console/`. Spins up a Postgres (`harmonify/postgres-action@v2`) for any tests that need it; pure-function tests don't.
- **rust matrix** — `cargo fmt --check`, `cargo clippy` (non-blocking), `cargo test` for `gateway` / `auth-service` / `zealot` in parallel. Caches each crate's `target/` separately.

### Running locally
```bash
# Console (API + UI)
cd console
pnpm install
pnpm dev          # Starts both console-api (:3100) and console-ui (:5173)
                  # console-api needs PostgreSQL; migrations auto-run on startup

# Or use the lifecycle scripts (background mode, with logging to /tmp/):
bash console/scripts/dev.sh start    # launch api+ui
bash console/scripts/dev.sh status   # check ports / pids
bash console/scripts/dev.sh logs     # tail api+ui logs (Ctrl-C to stop)
bash console/scripts/dev.sh stop     # SIGTERM → SIGKILL after grace period
bash console/scripts/dev.sh restart  # stop + start
bash console/scripts/dev.sh clean    # nuclear: kill zombies, free :3100 & :5173
# Logs: /tmp/ultralisk-api.log, /tmp/ultralisk-ui.log
# Pids: /tmp/ultralisk-api.pid, /tmp/ultralisk-ui.pid

# Quality gates (run before pushing):
cd console && pnpm lint && pnpm typecheck && pnpm test

# Rust crates (independent cargo projects, test per crate)
cd gateway && cargo test       # integration tests skip gracefully without PG/Redis
cd auth-service && cargo test
cd zealot && cargo test        # unit + gRPC e2e; needs python3.12 on PATH (pinned via zealot/.cargo/config.toml)
cd zealot && cargo run --bin zealot-backend   # Runtime Interface gRPC server on :9091
# real-inference CPU e2e (needs zealot/.venv per zealot/README.md; skips if unset):
cd zealot && ZEALOT_E2E_MODEL=hf-internal-testing/tiny-random-gpt2 \
  ZEALOT_SITE_PACKAGES="$PWD/.venv/lib/python3.12/site-packages" \
  HF_ENDPOINT=https://hf-mirror.com cargo test --test cpu_infer_e2e
```

### Where to make changes
- **Add API endpoint**: new module in `console/console-api/src/routes/` + wire in `src/index.ts` + SQL migration in `console/console-api/drizzle/`. `fixtures.ts` is only for the remaining mock routes.
- **Gateway change**: `gateway/src/` (middleware chain assembled in `app.rs`); routing behavior via `gateway/config/route_table.json`; integration tests in `gateway/tests/`
- **Zealot change**: `zealot/src/`; keep `zealot/README.md` + `zealot/docs/architecture.md` in sync
- **Add UI page**: `console/console-ui/src/pages/` (page component) + `src/App.tsx` (route) + `src/components/Sidebar.tsx` (nav item)
- **Architecture decision**: New file in `docs/adr/` following the ADR template. Update `docs/architecture.md` §10 decision record. Update roadmap if timeline affected.
- **Update roadmap**: `docs/ENGINEERING_ROADMAP.md` (engineering milestones). Sync `docs/roadmap.md` (product milestones) if needed.

### ADR template
```markdown
# ADR-XXX: Title
**日期**: YYYY-MM-DD
**状态**: proposed | accepted | deprecated
**依赖**: ADR-XXX, ADR-XXX

## Context
## Decision
## Rationale
## Consequences
```
Every ADR must reference `ADR-000 (Platform Object Model)` in its dependencies.

### Commit conventions
- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation only
- `refactor:` — code change that neither fixes nor adds
- Architecture decisions go in `docs/adr/`, not in commit messages.

---

## Current State (Phase 1 complete + Phase 2 complete + Phase 3 Console complete)

- **Gateway**: Phase 1 complete — auth, body-based routing, Lua-atomic rate limit, SSE streaming proxy, batch aggregation, cold-start queue, graceful shutdown, Prometheus metrics. M4: multi-instance batch coordination (Redis SETNX lease + cross-instance forwarding), weighted pod selection. M6: Route table hot-reload via file watcher (`notify` crate, `PollWatcher`). `cargo test --lib`: 29/29 pass.
- **Auth Service**: Complete — login/refresh/keys/validate_key/me, revocation via Pub/Sub + revocation_version fallback. TOTP two-factor authentication (setup, verify, disable, login/totp). `cargo test`: 12/12 pass.
- **Console API**: Real PostgreSQL (migrations 001-007). SaaS/Private mode via `DEPLOYMENT_MODE` env var. All routes PG-backed (no mock fixtures). Auditing middleware auto-logs POST/PUT/PATCH/DELETE. GPU utilization + cost analytics backed by dev-mode PG tables (ClickHouse-ready). Model registry for offline imports (HF/S3/MinIO).
- **Console UI**: 15 shared pages + SaaS-only (Billing, API Keys) + private-only (Setup Wizard, Audit Logs, Compliance, License, SSO). Mode-based route registration and sidebar. Mantine v9, React Router v7, `isSaaS()`/`isPrivate()` pattern. Sidebar and routes adapt to deployment mode.
- **Zealot**: P1 components done — Block Manager (generation-gated handles) + Constrained Decode (JSON schema → DFA). Scheduler landed: priority queue, block budget via BlockManager, admission control, OOM preemption (recompute). `zealot-backend` is a real Runtime Interface server (`proto/runtime/v1/runtime.proto`, ADR-010) running an Engine actor over a `ModelRunner` trait; dev-mode `PyModelRunner` (PyO3-embedded torch CPU forward, Python in decode loop — temporary until GPU kernels land) serves real inference end-to-end. 26/26 unit + 2/2 backend e2e + 1/1 real-model CPU e2e pass. CUDA kernels, Batch, sampling params still open.
- **Not deployed**: no real GPU, no vLLM, no K8s/KAI cluster. Inference behind the Gateway is still stubbed; Phase 1 acceptance metrics (P99 < 2s, revocation < 100ms, GPU util > 30%) are unverified.
