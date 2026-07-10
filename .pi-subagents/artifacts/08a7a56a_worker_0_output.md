Implemented Phase 2a Task 5: Deployments Page.

**Changed files:**
- `packages/console-ui/src/api/deployments.ts` — new API functions (getDeployments, getDeployment, scaleDeployment, rollbackDeployment)
- `packages/console-ui/src/hooks/useDeployments.ts` — new React Query hooks (useDeployments, useDeployment, useScaleDeployment, useRollbackDeployment)
- `packages/console-ui/src/components/deployments/DeploymentList.tsx` — new table component with loading skeletons, status badges, and navigation to detail
- `packages/console-ui/src/pages/deployments/DeploymentsPage.tsx` — overwritten placeholder with title + DeploymentList
- `packages/console-ui/src/pages/deployments/DeploymentDetailPage.tsx` — overwritten placeholder with full detail view (scale controls, rollback button, version history table)

**Validation:** `tsc --noEmit` passes with zero errors.