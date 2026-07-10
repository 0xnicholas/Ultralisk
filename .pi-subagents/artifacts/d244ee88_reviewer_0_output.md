Now I have all the information needed for a thorough review. Let me compile my findings.

---

## Review

### Correct

- **Stub data hierarchy**: Cluster → Node[] → GpuCard[] is well-structured and matches §9 data models. The three-cluster topology (us-east-1-prod with 8 nodes, us-west-2-prod with 4, eu-central-1-dev with 2) with realistic statuses (healthy, degraded) and GPU types (H100, A100) provides good demo coverage.
- **Deployment version history**: Fixtures for dep_001 (3 versions, active + rolled_back), dep_002 (2 versions), dep_003 (1 version), dep_004 (2 versions) with real image tags (vllm:v0.8.3-llama33) are realistic and exercise the version history table.
- **Per-GPU-card metrics**: Random-generated utilization (50-80%), memory (60-80/80 GB), temperature (60-75°C), processes (vllm/empty), and 30-point time-series are good for demo purposes.
- **Task boundaries**: Each task is independently commit-able and testable. The 5-task split (Stub API, Types/Routes/ Sidebar, Clusters, Nodes, Deployments) is appropriate for parallel or sequential execution.
- **API response formats**: All endpoints return `{ data, pagination }` consistent with §10.4 schema.

---

### Fixed

No fixes were applied (review-only mode).

---

### Blocker

1. **React state-update-during-render bug in `DeploymentDetailPage.tsx`** (Task 5, Step 4):

   The plan writes:
   ```typescript
   const [replicas, setReplicas] = useState(dep?.replicas ?? 1);
   // ...
   if (replicas !== dep.replicas && dep.replicas !== undefined) setReplicas(dep.replicas);
   ```

   The `setReplicas` call at component body scope (not inside a `useEffect`) triggers a React state update during render, which is illegal and will cause an infinite re-render loop. This must be wrapped in a `useEffect`:

   ```typescript
   useEffect(() => {
     if (dep?.replicas !== undefined && dep.replicas !== replicas) {
       setReplicas(dep.replicas);
     }
   }, [dep?.replicas]);
   ```

   **Severity**: critical — will crash the deployment detail page at runtime.

2. **Missing `@/utils/format` utility** (Task 4/5):

   `NodeDetailPage.tsx` uses `formatRelativeTime(v.deployed_at)` via an import from `@/utils/format`, but no step creates this utility. This will be a build-time type error/uncaught runtime error.

   **Severity**: blocker — prevents `DeploymentDetailPage` from compiling/rendering.

---

### Note

1. **§7.1 Cluster detail — incomplete coverage**: Design spec requires "网络拓扑、InfiniBand/RDMA 状态、最近告警". The plan:
   - Lists `ClusterTopology.tsx` in the file structure but never creates it.
   - Lists `recent_alerts` in the `ClusterDetail` type but never renders it in `ClusterDetailPage.tsx`.
   - Omits InfiniBand/RDMA status entirely.

   **Severity**: medium — plan scope is explicitly Phase 2a with deferred items, but these aren't listed as deferred. Should either be included or explicitly deferred.

2. **§7.2 Nodes list — missing columns per spec**: Design §7.2 says Node list shows "显存使用率、温度". The `NodeList.tsx` only shows hostname, GPU model, count, driver, CUDA, status — no memory or temperature columns.

   **Severity**: medium — visual gap from spec. Could be added as extra columns.

3. **§7.3 Deployments — missing "Logs" entry point**: Design spec lists "推理服务日志入口" but no log entry or link is present in the plan.

   **Severity**: low — can be deferred to 2b.

4. **Orphaned file structure entries**: `ClusterTopology.tsx`, `ScaleControls.tsx`, `RollbackControls.tsx` are listed in the file structure but never created in any task. Actual scale/rollback UI is inlined in `DeploymentDetailPage.tsx`. These should be removed from the file tree or the components should be extracted.

   **Severity**: low — docs/code inconsistency.

5. **`/nodes` and `/nodes/:id` routes not in §5.4**: The design spec's §5.4 Phase 2 route table doesn't list `/nodes`, `/nodes/:id`, `/deployments`, or `/deployments/:id`. However, these are implied by the §5.2 sidebar (Operations → Nodes, Deployments) and the §9 data models. The plan is correct to add them, but §5.4 is technically incomplete. Not a plan defect per se.

   **Severity**: low — spec inconsistency.

6. **API endpoints not in §10.2**: The plan adds `GET /v1/admin/clusters/:id`, `GET /v1/admin/nodes/:id`, `GET /v1/admin/clusters/:clusterId/nodes/:nodeId`, `GET /v1/admin/deployments`, `GET /v1/admin/deployments/:id`, `POST /v1/admin/deployments/:id/scale`, `POST /v1/admin/deployments/:id/rollback`. Only `GET /v1/admin/clusters` and `GET /v1/admin/nodes` are listed in §10.2. The deployment endpoints aren't in the spec at all.

   **Severity**: low — the design spec's §10.2 is incomplete for Phase 2 (e.g., it also omits `GET /v1/admin/deployments` despite §7.3 requiring a deployment list). The plan is reasonable.

7. **Stub fixture data mismatch**: `MOCK_CLUSTERS` has hardcoded `avg_gpu_util` values (67, 82, 34) while `generateGpuCards()` produces `Math.floor(Math.random() * 30 + 50)` which gives 50-79% util for individual GPUs. The cluster detail endpoint computes a real average from the random cards, so the detail value will never match the list value. Minor but could confuse during demo.

   **Severity**: low — cosmetic, can be improved by seeding or recomputing on the list endpoint too.

8. **Cluster list — no degraded-cluster warning**: The spec's competitive analysis (§2.7) notes Together AI has GPU Clusters self-service. The plan has an `IconAlertTriangle` card counting degraded clusters, but no link or deeper drill-down for self-service cluster management.

   **Severity**: low — deferred to later phases.

---

## Acceptance Report