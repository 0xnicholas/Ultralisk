# Task for worker

Clean up tech debt

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

## Step 1: Check vite.config.ts for port consistency

Read `packages/console-ui/vite.config.ts`. Make sure the proxy ports are `3100` (not 3001).

## Step 2: Remove unused imports from Sidebar

Read `packages/console-ui/src/components/Sidebar.tsx`. Check if `IconSettings` and `IconSlash` are actually used (they were added for Settings/Integrations sidebar items that might not exist as nav items). If they're imported but not used, remove them.

## Step 3: Check for any other unused imports

```bash
cd packages/console-ui && npx tsc --noEmit 2>&1 | head -20
```

If there are any "is declared but its value is never read" warnings, fix them.

## Step 4: Commit

```bash
git add -A && git commit -m "chore: cleanup unused imports and fix port consistency"
```

## Acceptance Contract
Acceptance level: checked
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope

Required evidence: changed-files, tests-added, commands-run, residual-risks, no-staged-files

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