I now have a complete picture. Let me compile the review.

---

## Review: Phase 1b Implementation Plan

### What is Correct

**Routes match spec (§5.4)** ✅
All six Phase 1b routes match exactly: `/endpoints`, `/endpoints/new`, `/endpoints/:id`, `/batch-jobs`, `/batch-jobs/new`, `/batch-jobs/:id`.

**API contracts match spec (§10.2)** ✅
- `GET/POST/DELETE /v1/admin/batch-jobs` — correct
- `GET/POST/PATCH/DELETE /v1/admin/endpoints` — correct
- Paginated & Single response wrappers consistent with §10.4

**Sidebar matches spec IA (§5.2)** ✅
The plan correctly adds an "Inference" section between "Develop" and "Organization" containing Endpoints and Batch Jobs, matching the information architecture.

**Endpoints features cover §6.5** ✅
List (name/model/type/status), create form, detail view, metrics mini-card (QPS/TTFT p95/TPOT/Error rate/GPU Util), autoscaling policy display — all covered.

**Batch Jobs features cover §6.6** ✅ (with one gap — see below)
List (name/model/status/tokens/cost), create form with file upload + callback URL, detail view, error log display, cancel button, download button.

**Playground enhancements** ✅
Backend persistence, API view (curl/Python/TypeScript), message editing, regeneration, multi-modal image upload — all present.

**Billing download buttons** ✅
The plan adds `IconDownload` ActionIcon to each invoice row, addressing the "支持下载" requirement from §6.7.

**Models table placeholder columns** ✅
Phase 2 placeholder columns for Avg Latency and GPU Utilization match the spec's instruction to "预留" these columns.

**Task granularity is good** ✅
Most tasks follow the pattern: stub → types/hooks → components → pages → verify → commit. Each task is bounded (1–4 files per step) and executable.

---

### Issues Found

#### Critical (blockers)

1. **Missing `GET /v1/admin/endpoints/:id` and `GET /v1/admin/batch-jobs/:id` stub handlers**
   - File: `packages/console-api/src/index.ts` (planned modifications in Task 1)
   - The plan's Task 1 adds handlers for `GET /v1/admin/endpoints` (list), `POST`, `PATCH`, and `DELETE`, but **omits** `GET /v1/admin/endpoints/:id`.
   - Similarly, Task 1 adds `GET /v1/admin/batch-jobs` (list), `POST`, and `DELETE`, but **omits** `GET /v1/admin/batch-jobs/:id`.
   - The frontend hooks `useEndpoint(id)` and `useBatchJob(id)` both call these missing single-resource endpoints. EndpointDetailPage and BatchJobDetailPage will **404** on load during development.
   - **Severity:** Critical — detail pages non-functional from the start.

#### Moderate

2. **Missing output format selection in CreateBatchJobForm**
   - File: `packages/console-ui/src/components/batch-jobs/CreateBatchJobForm.tsx` (Task 4, Step 3)
   - Spec §6.6 says: "上传 JSONL 文件、**选择模型、配置回调 URL、选择输出格式**"
   - The plan only implements model selection, file upload, and callback URL. No output format dropdown (e.g., `jsonl` / `json`).
   - **Severity:** Moderate — spec requirement omitted.

3. **BackendSession type uses `model_id` (snake_case) but sync code references `session.modelId` (camelCase)**
   - File: `packages/console-ui/src/types/index.ts` (Task 2, Step 1) + `packages/console-ui/src/hooks/usePlaygroundSession.ts` (Task 6, Step 2)
   - The new `BackendSession` interface defines `model_id: string`, but the existing `PlaygroundSession` type uses `modelId: string`.
   - Task 6's sync code snippet says: `apiCreateSession({ name: session.name, model_id: session.modelId, ... })` — this passes `session.modelId` (camelCase) to the `model_id` field. This is correct for the API call but the plan doesn't show the mapping explicitly.
   - More critically, when loading sessions FROM the backend, `model_id` won't match `modelId` in the existing `PlaygroundSession` type used by `usePlaygroundSession`. The sync logic needs a transformer function.
   - **Severity:** Moderate — will cause TypeScript errors or runtime mismatches.

4. **Billing: time range selector lacks "custom" range**
   - File: `packages/console-ui/src/components/billing/UsageChart.tsx`
   - Spec §6.7 says: "Time range: 今天 / 7 天 / 30 天 / **自定义**"
   - Phase 1a already provides Today/7d/30d via `SegmentedControl`. The plan says "time range already done in Phase 1a" (correct) but doesn't add the "custom" date picker.
   - **Severity:** Moderate — spec mentions custom range as an option.

#### Minor / Style

5. **Task 6 (Playground persistence) is too vague for execution**
   - The plan says: "modify `usePlaygroundSession` to sync with backend" with only code snippets showing import/API-call additions, but says "add a `useEffect` to load backend sessions on mount and merge with localStorage sessions" without providing the actual `useEffect` code or merge logic.
   - A subagent implementing this would need to design the merge strategy (last-write-wins? conflict resolution?) — which should be specified.
   - **Severity:** Minor — can be clarified.

6. **Task 8 code is pseudocode, not executable**
   - Task 8 provides `handleEditMessage` and `handleRegenerate` as illustrative snippets without proper TypeScript types, import paths, or integration with the `usePlaygroundSession` hook's existing API.
   - The `handleRegenerate` snippet references `send(...)` and `setStreamingContent(...)` as if they're in scope but doesn't show how to wire them.
   - **Severity:** Minor — needs to be concrete for a subagent.

7. **`Endpoint.status` includes `'serverless'` type but stub doesn't use it**
   - The `Endpoint` type in the plan includes `type: 'serverless' | 'reserved' | 'dedicated'` — this is correct per §6.5 which lists "Serverless / Reserved / Dedicated". However, the spec says Phase 1b is about "预留/独享端点" (reserved/dedicated). The CreateEndpointPage only offers reserved/dedicated. The type inclusion is forward-looking but okay.
   - **Severity:** Minor — not an issue.

---

### Summary

| Category | ✅ Correct | ❌ Issues |
|----------|-----------|-----------|
| Routes | All 6 routes match §5.4 | — |
| API contracts | Spec contracts match | **Missing `GET by ID` handlers** (critical) |
| Sidebar | Inference section matches §5.2 IA | — |
| Endpoints | List/create/detail/metrics/autoscaling all covered | — |
| Batch Jobs | List/create/detail/errors all covered | **Missing output format selector** |
| Billing | Invoice download added | **Missing custom time range** |
| Playground | Backend persistence, API view, editing, multi-modal | **Type mismatch (modelId vs model_id)** |
| Task granularity | Well-bounded tasks with verify-commit pattern | **Tasks 6 & 8 too vague** |

**Overall verdict: ❌ Issues found — actionable feedback provided above.**

Fix the critical missing stub handlers and the moderate gaps, then the plan is ready to execute.