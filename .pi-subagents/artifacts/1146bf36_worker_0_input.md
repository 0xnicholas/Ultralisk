# Task for worker

Add ErrorBoundary + unified API error handling

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk/packages/console-ui

## Step 1: Create ErrorBoundary component

Create `packages/console-ui/src/components/ErrorBoundary.tsx`:
```typescript
import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Alert, Button, Center, Stack, Text, Title } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('ErrorBoundary caught:', error, info); }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <Center h={400}>
          <Stack align="center" gap="md">
            <IconAlertCircle size={48} color="var(--mantine-color-red-6)" />
            <Title order={3}>Something went wrong</Title>
            <Text size="sm" c="dimmed" maw={400} ta="center">{this.state.error?.message}</Text>
            <Button variant="light" onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}>
              Reload Page
            </Button>
          </Stack>
        </Center>
      );
    }
    return this.props.children;
  }
}
```

## Step 2: Wrap App.tsx with ErrorBoundary

Read `App.tsx`. Add import:
```typescript
import { ErrorBoundary } from '@/components/ErrorBoundary';
```

Wrap the top-level `<Routes>` inside `<ErrorBoundary>`:
```typescript
<ErrorBoundary>
  <Routes>...</Routes>
</ErrorBoundary>
```

## Step 3: Create API error toast utility

Create `packages/console-ui/src/api/errorHandler.ts`:
```typescript
import { notifications } from '@mantine/notifications';
import { IconX } from '@tabler/icons-react';

export function showApiError(error: unknown, title = 'Request Failed') {
  const message = error instanceof Error ? error.message : 'An unexpected error occurred';
  notifications.show({ icon: <IconX size={16} />, color: 'red', title, message, autoClose: 5000 });
}

export function handleQueryError(error: unknown): { error: Error } {
  showApiError(error);
  return { error: error instanceof Error ? error : new Error('Unknown error') };
}
```

## Step 4: Add default error handling to QueryClient in App.tsx

Read `App.tsx`. Modify the QueryClient creation:
```typescript
import { showApiError } from '@/api/errorHandler';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
    mutations: {
      onError: (error) => showApiError(error),
    },
  },
});
```

## Step 5: Verify typecheck

```bash
pnpm typecheck
```

## Step 6: Commit

```bash
cd /Users/nicholasl/Documents/build-whatever/Ultralisk && git add packages/console-ui/src && git commit -m "feat: add ErrorBoundary and unified API error handling"
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