# Task for worker

You are implementing Task 5: Billing Enhancement

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

## Step 1: Add download buttons to InvoicesTable

Read `packages/console-ui/src/components/billing/InvoicesTable.tsx`.

Add to imports:
```typescript
import { IconDownload } from '@tabler/icons-react';
import { ActionIcon, Tooltip } from '@mantine/core';
```

Add a new column header after "Issued":
```typescript
<Table.Th></Table.Th>
```

And in each Table.Tr, add a cell after the issued date for download:
```typescript
<Table.Td>
  <Tooltip label="Download invoice">
    <ActionIcon variant="subtle" size="sm" component="a" href={inv.download_url} target="_blank">
      <IconDownload size={14} />
    </ActionIcon>
  </Tooltip>
</Table.Td>
```

## Step 2: Commit

```bash
git add packages/console-ui/src
git commit -m "feat: add invoice download buttons to Billing page"
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