Now I have all the evidence I need. Here is my structured review:

---

## Review

### ✅ Correct — What's Already Good

1. **All Phase 1a routes covered**: The plan implements every route from the spec's §5.4 Phase 1a table: `/dashboard`, `/playground`, `/playground/:sessionId`, `/models`, `/models/:modelId`, `/api-keys`, `/billing`, `/settings/profile`, plus auth routes `/login` and `/accept-invitation`. Root `/` redirects to `/dashboard` as specified.

2. **Route naming matches spec exactly**: RESTful resource-style as specified (`/models/:modelId`, not query-param style). Playground session route uses `:sessionId` as the spec dictates.

3. **API response shapes match spec contracts**: The `types/index.ts` faithfully mirrors the spec's §10.4 schema definitions — `User`, `Model`, `ApiKey`, `ApiKeyCreated`, `UsageSummary`, `Billing`, `ChatMessage`, `PlaygroundSession`, `PaginatedResponse<T>`, `SingleResponse<T>` all match.

4. **Stub server endpoints are correct**: The Express stub implements all the core Phase 1a endpoints with proper JSON shapes. SSE streaming for chat completions matches the OpenAI-compatible chunk format from the spec.

5. **Playground is prioritized as #1 differentiator**: Task 7 is the most detailed task with 14 steps, full streaming, multi-session tabs, localStorage persistence, error state taxonomy (rate_limit/timeout/general), parameter panel with all 7 parameters from the spec, system prompt, and token estimation. The plan's summary explicitly ties each feature to the competitive analysis.

6. **API Key roles + model allowlist implemented**: CreateKeyModal includes role selector (admin/developer/readonly), model multi-select allowlist, and monthly quota. The secret-only-once reveal pattern is correct.

7. **Task granularity is excellent**: Every task has exact file lists, copy-paste-ready code blocks, verification commands (`pnpm typecheck`), and commit messages. An agentic worker can execute them sequentially.

8. **Sidebar navigation matches spec IA**: The `Sidebar.tsx` sections (Home, Develop, Organization) match the spec's §5.2 navigation structure for Phase 1a.

9. **Dashboard sections match spec**: AccountStatusBanner (P0), DeveloperQuickstart (P0), UsageSummaryCards (P0), QuickActions (P0), RecentActivity (P1), ExamplesResources (P1) — all present and correctly prioritized.

10. **Dark mode spec compliance**: The plan implements light/dark/system via Mantine's `useMantineColorScheme` in both TopBar toggle and Profile/Settings page, matching the spec's §15 open question #1 resolution.

---

### ❌ Blocker — Must Fix Before Proceeding

**B1: Vite `@/` path alias configured too late** (`docs/superpowers/plans/2026-07-10-console-phase-1a.md`, lines 3971–3989)

The `resolve.alias` for `@/` is only added in Task 11 Step 1, but `@/` imports (`@/types`, `@/stores/AuthContext`, `@/layouts/ConsoleLayout`, etc.) are used from Task 2 onwards. The `tsconfig.json` has `paths: { "@/*": ["./src/*"] }` from the start, so TypeScript is happy, but **the Vite dev server won't resolve these imports** during Tasks 2–10. Developers will see blank screens or module-not-found errors.

**Fix**: Move the `resolve.alias` block into the initial `vite.config.ts` in Task 1 Step 2, not Task 11.

---

### 🔴 Issues Found — Should Address

**I1: `KeyUsageTable.tsx` listed but never created** (plan line 82 vs. Task 9, lines 3598–3693)

The file structure header lists `src/components/api-keys/KeyUsageTable.tsx` (line 82), and the spec §6.7 explicitly requires "**Usage by API key**: 按 key 拆分的用量表" on the Billing page. However, no task creates this component. The Billing page (Task 9) only implements `BalanceCard`, `UsageChart`, and `InvoicesTable`. The per-key usage data is available in `MOCK_USAGE.by_key` and the `UsageSummary` type includes `by_key[]`, but nothing renders it.

**Fix**: Either create `KeyUsageTable.tsx` and add it to `BillingPage.tsx`, or explicitly defer it to Phase 1b in the plan summary.

**I2: `PATCH /v1/admin/api-keys/:id` endpoint missing** (spec §10.2, line 813; plan Task 8, lines 3256–3593)

The spec lists `PATCH /v1/admin/api-keys/:id` for "更新 API Key（角色、限额等）". Neither the stub server nor the plan implements this. Without it, users cannot update a key's role or quota after creation — only create and revoke are possible.

**Fix**: Either add a stub PATCH endpoint and UI (minimal: just note it in the plan), or explicitly defer to Phase 1b.

**I3: Invitation management endpoints missing** (spec §10.2, lines 799–800; plan Task 4)

The spec lists `POST /v1/admin/invitations` and `GET /v1/admin/invitations` as Phase 1a endpoints. The plan has `AcceptInvitationPage` but no mechanism for an admin to create invitations. The stub server has no invitation endpoints at all. The spec's §15 open question #3 resolved: "Phase 1a invitation-only. 管理员手动发送邀请链接。" This implies invitations are needed in Phase 1a.

**Fix**: Either add stub invitation endpoints (can be trivial — return a mock token), or document that Phase 1a admin creates invitations through a separate tool (CLI/email).

**I4: AuthContext bypasses `api/auth.ts` module** (plan Task 3 Step 2 vs. Task 2 Step 2)

`api/auth.ts` defines `login()`, `acceptInvitation()`, and `getMe()` functions, but `AuthContext.tsx` uses raw `fetch()` calls directly. The `api/auth.ts` module is dead code. This creates maintenance risk — two different implementations of the same logic.

**Fix**: Refactor `AuthContext.tsx` to call `api/auth.ts` functions instead of raw `fetch`.

**I5: `POST /v1/admin/auth/logout` missing from stub** (spec §10.2, line 797; plan Task 4)

Minor since the plan's logout is purely client-side (remove JWT from localStorage), but the spec explicitly lists this endpoint. The stub should at least return 200 for completeness.

---

### 📝 Notes — Observations and Risks

**N1: `ApiViewModal.tsx` listed in file structure but deferred** (plan line 78, line 4053)

The file structure lists `src/components/playground/ApiViewModal.tsx`, but the plan summary correctly defers it to Phase 1b. Consider removing from the Phase 1a file structure listing to avoid false expectations.

**N2: Model table missing "Deploy custom model" action** (spec §6.2, line ~370 area)

The spec says the Models table should have a "Deploy custom model" action that, in Phase 1, "可跳转提示" (can redirect with a tip). The plan's `ModelsTable.tsx` only has "Open in Playground" and "View Details" actions.

**N3: Reserved columns for Phase 2 not in Models table** (spec §6.2: "表格中预留「Avg Latency」/「GPU Utilization」列（Phase 2 填充数据）")

The plan's `ModelsTable` doesn't include these reserved columns. Minor, but architectural foresight was requested.

**N4: No accessibility considerations** (spec §11: "符合 WCAG 2.1 AA 基本要求")

The plan has no accessibility-related steps. Mantine components are fairly accessible by default, but no verification is planned. Low risk for MVP, worth noting.

**N5: `react-markdown` added mid-task instead of in initial scaffolding** (plan Task 7 Step 12, lines 3225–3228)

The `pnpm add react-markdown` command is embedded in Task 7 rather than in the initial `package.json`. Not a blocker — works as written — but it means someone executing Task 7 independently needs to remember this step before typecheck will pass.

**N6: `usePlaygroundChat` hook error-type detection uses string matching on error messages** (plan lines ~2660–2680)

The `errorType` detection checks `msg.includes('429')` and `msg.includes('timeout')`. This is fragile — depends on the stub/backend including these substrings in error messages. Acceptable for Phase 1a but should migrate to structured error codes from the API later.

**N7: PlaygroundPage potential double-session creation on first render** (plan lines ~3130–3140)

The code does `if (!activeSession && sessions.length === 0) { createSession(urlModelId); }` which triggers a render-side effect — React strict mode (used in `main.tsx`) will double-invoke this. Low severity for MVP, but worth fixing before production.

---

### Acceptance Report