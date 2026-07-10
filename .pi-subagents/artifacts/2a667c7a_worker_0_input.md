# Task for worker

You are implementing Task 1: Monorepo Scaffold & Tooling

## Task Description

### Step 1: Create root workspace config

```bash
mkdir -p packages/console-ui packages/console-api
```

Write `pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
```

Write root `package.json`:
```json
{
  "name": "ultralisk-console",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck"
  },
  "devDependencies": {
    "turbo": "^2.4.0",
    "typescript": "^5.7.0"
  },
  "packageManager": "pnpm@9.15.0",
  "engines": {
    "node": ">=20"
  }
}
```

Write `turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": {},
    "typecheck": { "dependsOn": ["^build"] }
  }
}
```

Write `.npmrc`:
```
auto-install-peers=true
strict-peer-dependencies=false
```

### Step 2: Scaffold console-ui package

Write `packages/console-ui/package.json`:
```json
{
  "name": "@ultralisk/console-ui",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 5173",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@mantine/charts": "^9.0.0",
    "@mantine/core": "^9.0.0",
    "@mantine/form": "^9.0.0",
    "@mantine/hooks": "^9.0.0",
    "@mantine/notifications": "^9.0.0",
    "@tabler/icons-react": "^3.31.0",
    "@tanstack/react-query": "^5.62.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-router-dom": "^7.1.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.4.0",
    "postcss": "^8.5.0",
    "postcss-preset-mantine": "^1.18.0",
    "postcss-simple-vars": "^7.0.1",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

Write `packages/console-ui/vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/v1/admin': 'http://localhost:3001',
      '/v1/chat': 'http://localhost:3001',
    },
  },
});
```

Write `packages/console-ui/postcss.config.cjs`:
```javascript
module.exports = {
  plugins: {
    'postcss-preset-mantine': {},
    'postcss-simple-vars': {
      variables: {
        'mantine-breakpoint-xs': '36em',
        'mantine-breakpoint-sm': '48em',
        'mantine-breakpoint-md': '62em',
        'mantine-breakpoint-lg': '75em',
        'mantine-breakpoint-xl': '88em',
      },
    },
  },
};
```

Write `packages/console-ui/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

Write `packages/console-ui/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ultralisk Console</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Write `packages/console-ui/src/vite-env.d.ts`:
```typescript
/// <reference types="vite/client" />
```

### Step 3: Scaffold console-api stub package

Write `packages/console-api/package.json`:
```json
{
  "name": "@ultralisk/console-api",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "express": "^5.1.0",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/cors": "^2.8.17",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

Write `packages/console-api/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

### Step 4: Install dependencies and verify

```bash
pnpm install
```
Expected: all packages install without errors.

### Step 5: Verify dev server starts

```bash
cd packages/console-ui && pnpm dev
```
Expected: Vite starts on http://localhost:5173

### Step 6: Commit

```bash
git add -A
git commit -m "chore: scaffold monorepo with console-ui (Vite+React+Mantine) and console-api (Express stub)"
```

## Context

This is Task 1 of 11 in the Ultralisk Console Phase 1a implementation plan. This is a greenfield project — the repo currently only has docs and screenshots. We need to create the monorepo scaffolding from scratch.

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

The full plan is at docs/superpowers/plans/2026-07-10-console-phase-1a.md

## Before You Begin

If you have questions about requirements, approach, or anything unclear, ask them now.

## Your Job

1. Create all the files listed above
2. Run `pnpm install` 
3. Verify Vite dev server starts (just check it starts without errors — no need to keep it running)
4. Commit your work
5. Self-review and report back

## Code Organization

Follow the file structure exactly as specified. Each config file has one clear responsibility.

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