# Task for worker

Add GitHub Actions CI pipeline

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

## Step 1: Create CI workflow

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: TypeScript check (console-ui)
        run: pnpm --filter @ultralisk/console-ui typecheck

      - name: TypeScript check (console-api)
        run: pnpm --filter @ultralisk/console-api typecheck

      - name: Tests
        run: pnpm --filter @ultralisk/console-ui test

      - name: Build (console-ui)
        run: pnpm --filter @ultralisk/console-ui build

      - name: Build (console-api)
        run: pnpm --filter @ultralisk/console-api build
```

## Step 2: Commit

```bash
cd /Users/nicholasl/Documents/build-whatever/Ultralisk && git add .github/workflows/ci.yml && git commit -m "ci: add GitHub Actions workflow with typecheck, tests, and build"
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