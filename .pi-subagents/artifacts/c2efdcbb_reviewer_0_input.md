# Task for reviewer

You are reviewing the Ultralisk Console Phase 2 code for production readiness.

## What Was Implemented

Full Phase 2 Operations module (Clusters, Nodes, Deployments, GPU Utilization, Cost Analytics, Incidents with AI diagnostics, Auto-Remediation, Slack config, Organization/RBAC) plus polish (ErrorBoundary, GitHub Actions CI, empty states, tech debt cleanup).

## Requirements/Plan

Spec: `docs/superpowers/specs/2026-07-10-ultralisk-console-design.md` (§7 complete, §5 sidebar/routes, §9 data models)

## Git Range

Base: `3198807` (Phase 2a types/start)
Head: `708bd22` (current HEAD)

Due to the large diff, focus the review on the SOURCE files only — ignore `.pi-subagents/` artifacts. Review key files from:

- `packages/console-ui/src/pages/` — all page components
- `packages/console-ui/src/components/` — all component files  
- `packages/console-ui/src/api/` — API client modules
- `packages/console-ui/src/hooks/` — React Query hooks
- `packages/console-ui/src/types/index.ts` — type definitions
- `packages/console-ui/src/App.tsx` — routing
- `packages/console-ui/src/components/Sidebar.tsx` — navigation
- `packages/console-ui/src/components/ErrorBoundary.tsx` — error handling
- `packages/console-api/src/` — stub backend

## Checklist

**Code Quality:**
- Clean component architecture? Separation of concerns?
- Proper TypeScript usage (no `any`, proper generics)?
- Error handling at page, hook, and API levels?
- Edge cases handled (loading, empty, error states)?

**Architecture:**
- Routes organized correctly by phase?
- Data fetching via React Query (cache invalidation, refetch)?
- sidebar navigation matches IA?

**Production Readiness:**
- Build passes? Tests pass?
- No obvious runtime errors?
- Is the codebase navigable for new developers?

Report: Strengths, Issues (Critical/Important/Minor), Assessment (Ready to merge / With fixes / Not ready)

Start by reading a representative sample of files from each category.

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