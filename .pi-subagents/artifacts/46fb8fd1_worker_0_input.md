# Task for worker

Setup Vitest + React Testing Library

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk/packages/console-ui

## Step 1: Install deps

```bash
pnpm add -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

## Step 2: Add vitest config to vite.config.ts

Read `vite.config.ts`. Add `/// <reference types="vitest" />` at the top, and add a `test` block:

```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    proxy: { '/v1/admin': 'http://localhost:3100', '/v1/chat': 'http://localhost:3100' },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});
```

## Step 3: Create setup file

Create `packages/console-ui/src/test/setup.ts`:
```typescript
import '@testing-library/jest-dom';
```

## Step 4: Add test script to package.json

Read `package.json`. Add to scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

## Step 5: Write a smoke test

Create `packages/console-ui/src/test/smoke.test.tsx`:
```typescript
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('vitest works', () => {
    expect(1 + 1).toBe(2);
  });

  it('renders the app without crashing', async () => {
    // Basic import check - if this fails, module resolution is broken
    const { App } = await import('@/App');
    expect(App).toBeDefined();
  });
});
```

## Step 6: Verify

```bash
pnpm test
```

Expected: 2 tests pass.

## Step 7: Commit

```bash
cd /Users/nicholasl/Documents/build-whatever/Ultralisk && git add packages/console-ui/vite.config.ts packages/console-ui/package.json packages/console-ui/pnpm-lock.yaml packages/console-ui/src/test/ && git commit -m "test: setup Vitest + React Testing Library with smoke test"
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