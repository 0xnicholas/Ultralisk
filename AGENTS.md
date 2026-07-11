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
  ├── console-api/           ← Express mock API (TypeScript, port 3100)
  │     src/index.ts         ← All 18 route groups, pure fixtures
  │     src/fixtures.ts      ← Mock data for models, users, billing, etc.
  ├── console-ui/            ← React SPA (TypeScript, Vite, Mantine v9)
  │     src/App.tsx          ← React Router v7 routes
  │     src/api/             ← API client modules (auto-generated from mock)
  │     src/pages/           ← Page components per route
  │     src/components/      ← Shared UI components
  │     vite.config.ts       ← Dev proxy /v1/admin → :3100, /v1/chat → :3100
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

.gitignore                   ← Root-level, also covers console/ paths
```

---

## Tech Stack

| Layer | Tech | Notes |
|-------|------|-------|
| Gateway | **Rust** (planned) | Self-built. `tower` middleware, body-based routing. NOT Kong. |
| Console API | **TypeScript + Express 5** | Currently mock-only. Real DB in Phase 2. |
| Console UI | **React 19 + TypeScript + Mantine v9** | Vite dev server proxies to :3100 |
| Inference | **vLLM** (Phase 1) → **Zealot** (Rust+CUDA, Phase 2+) | Fork vLLM, replace attention kernel + scheduler |
| Container | **Kubernetes + KAI Scheduler** | GPU-aware Pod scheduling |
| DB | **PostgreSQL + Redis + ClickHouse + Loki** | Domain-driven: Control/Cache/Telemetry/Artifact |
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

### Running locally
```bash
cd console
pnpm install
pnpm dev          # Starts both console-api (:3100) and console-ui (:5173)
```

### Where to make changes
- **Add API endpoint**: `console/console-api/src/index.ts` (add route) + `fixtures.ts` (add mock data)
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

## Current State (Phase 1a Mock)

- **Console API**: All endpoints return mock data from `fixtures.ts`. No real auth, no real DB.
- **Console UI**: Full Phase 1a + 2 UI pages exist. Connected to mock API via Vite proxy.
- **Gateway**: Not implemented. Vite dev proxy stands in (`/v1/admin` → `:3100`, `/v1/chat` → `:3100`).
- **Engine**: Not deployed. Mock chat completions endpoint returns SSE stub text.

**What's real**: Console UI code. **What's mock**: Everything else.
