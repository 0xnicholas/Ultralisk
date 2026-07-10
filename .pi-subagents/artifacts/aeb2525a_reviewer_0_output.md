I now have all the evidence needed. Here is my complete review.

---

## Review

### Fix 1: Missing `GET /v1/admin/endpoints/:id` and `GET /v1/admin/batch-jobs/:id`
- ✅ **Correct**: Both endpoints are present in Task 1, Step 2 with proper 404 handling (`res.status(404).json({ error: { code: 'not_found', message: '...not found' } })`). Matches the API contract from the design spec (§10.4).

### Fix 2: Missing output format selector in CreateBatchJobForm
- ❌ **Not applied**. The design spec (§6.6 Batch Jobs) explicitly requires "选择输出格式" (select output format) as a feature of Create job. However:
  - `CreateBatchJobForm.tsx` has **no** output format state variable, no UI `<Select>` or `<SegmentedControl>` for output format
  - `CreateBatchJobRequest` type has **no** `output_format` field
  - The backend mock POST handler **ignores** any output format
  - The form fields are only: Job Name, Model, Input File, Callback URL
  - File: `packages/console-ui/src/components/batch-jobs/CreateBatchJobForm.tsx` (plan lines ~740-795)

### Fix 3: BackendSession modelId/model_id mapping
- ✅ **Correct**: The mapping is documented at the API boundary in Task 6, Step 2. Frontend uses `session.modelId` (camelCase, from existing `usePlaygroundSession` hook) and maps to `model_id: session.modelId` for the backend API call. The `BackendSession` type uses `model_id` (snake_case). This is the standard frontend/backend boundary convention.

### Fix 4: Task 6 vague → complete merge strategy with useEffect code
- ⚠️ **Partially applied**. The plan now includes:
  - Specific import statements (`useAuth`, `apiCreateSession`, etc.)
  - The createSession API sync call: `apiCreateSession({ name: session.name, model_id: session.modelId, messages: session.messages }).catch(() => {})`
  - A sentence: "Also add a `useEffect` to load backend sessions on mount (when user is logged in) and merge with localStorage sessions."
- Still missing:
  - **No actual `useEffect` code** — it's described in prose only
  - **No merge strategy code** — how are localStorage sessions merged with backend sessions? By ID? By name? What happens with conflicts?
  - **Save and delete** sync is hand-waved: "And similarly for save and delete operations" — no code shown
  - Error handling is bare `.catch(() => {})` — silent failures

### Fix 5: Task 8 pseudocode → full TypeScript handlers
- ✅ **Correct**: The plan now contains complete TypeScript implementations:
  - `editingIndex: useState<number | null>(null)` with proper nullable state
  - `handleEditMessage`, `handleSaveEdit`, `handleCancelEdit` with null checks and array map logic
  - `handleRegenerate` with last-user-message detection, array slice, and streaming content reset
  - ChatArea rendering condition for edit mode with `Textarea` + Save/Cancel buttons
  - All handlers have proper early returns for guard conditions

---

### Residual risks

1. **Output format selector (Fix 2)**: Still missing from the plan. The design spec (§6.6) requires it. Without it, the create-batch-job feature is incomplete vs. the spec.

2. **Task 6 merge strategy**: The useEffect merge logic is still vague prose. An implementer will need to make decisions about deduplication, conflict resolution, and session ordering that should be specified.

3. **Silent error swallowing**: Both the session sync (`.catch(() => {})`) and the regenerate handler do not surface errors to the user. Background failures will be invisible.

4. **Task 6 save/delete sync**: No code is provided for update and delete sync operations — only "similarly" with no concrete implementation details.

---