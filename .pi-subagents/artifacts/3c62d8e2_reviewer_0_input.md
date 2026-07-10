# Task for reviewer

Review the Phase 1a implementation plan at `docs/superpowers/plans/2026-07-10-console-phase-1a.md` against the design spec at `docs/superpowers/specs/2026-07-10-ultralisk-console-design.md`.

Focus on:
1. **Completeness** — does the plan cover all Phase 1a pages/modules from the spec? (Dashboard, Models, Playground, API Keys, Billing, Settings/Profile, Auth)
2. **Correctness** — do routes, file paths, component names, and API contracts match the spec?
3. **Priority alignment** — does the plan prioritize Playground as the #1 differentiator per competitive analysis?
4. **Gaps** — anything in the spec that's missing from the plan? Any deferred items that shouldn't be deferred?
5. **Task granularity** — are tasks bite-sized and executable? Do they have exact commands?

Report findings as: ✅ Approved / ❌ Issues Found with specific actionable feedback.

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