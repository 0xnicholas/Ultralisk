# Task for reviewer

Review `docs/superpowers/plans/2026-07-10-console-phase-2a.md`.

Check:
1. Does it cover §7.1 Clusters, §7.2 Nodes, §7.3 Deployments from the design spec? (list/detail per section)
2. Are Phase 2 routes correct? (§5.4: /clusters, /clusters/:id, /clusters/:clusterId/nodes/:nodeId, also /nodes, /deployments)
3. Are the API endpoints consistent with §10.2? (clusters, nodes, deployments)
4. Are Stub API fixtures realistic (Cluster → Node → GpuCard hierarchy, Deployment version history)?
5. Task granularity OK?

Report: ✅ Approved or ❌ Issues found.

## Acceptance Contract
Acceptance level: attested
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Return concrete findings with file paths and severity when applicable

Required evidence: review-findings, residual-risks

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```