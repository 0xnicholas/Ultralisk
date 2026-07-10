# Task for worker

You are implementing Task 6: Playground — Backend Session Persistence

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

Tasks 1-5 done. Create the sessions API and modify the Playground session hook to sync with backend.

## Step 1: Create sessions API

Create `packages/console-ui/src/api/sessions.ts`:
```typescript
import { apiFetch } from './client';
import type { PaginatedResponse, SingleResponse, BackendSession } from '@/types';

export async function getSessions() { return apiFetch<PaginatedResponse<BackendSession>>('/v1/admin/sessions'); }
export async function createSession(data: { name?: string; model_id?: string; messages?: { role: string; content: string }[] }) { return apiFetch<SingleResponse<BackendSession>>('/v1/admin/sessions', { method: 'POST', body: JSON.stringify(data) }); }
export async function updateSession(id: string, data: Partial<BackendSession>) { return apiFetch<SingleResponse<BackendSession>>(`/v1/admin/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }); }
export async function deleteSession(id: string) { return apiFetch<void>(`/v1/admin/sessions/${id}`, { method: 'DELETE' }); }
```

## Step 2: Modify usePlaygroundSession hook

Read `packages/console-ui/src/hooks/usePlaygroundSession.ts` first.

Add these imports at the top:
```typescript
import { useEffect } from 'react';
import { useAuth } from '@/stores/AuthContext';
import { createSession as apiCreateSession, updateSession as apiUpdateSession, deleteSession as apiDeleteSession, getSessions as fetchBackendSessions } from '@/api/sessions';
```

Inside the hook function, add after `const activeSession = sessions.find((s) => s.id === activeId);`:
```typescript
const { user } = useAuth();

// Merge with backend on mount (when user is logged in)
useEffect(() => {
  if (!user) return;
  fetchBackendSessions().then((res) => {
    const backend = res.data.map((s: any) => ({
      id: s.id, name: s.name, modelId: s.model_id,
      messages: s.messages.map((m: any) => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })),
      createdAt: s.created_at, updatedAt: s.updated_at,
    }));
    const localSessions = getSessions();
    const merged = [...backend];
    for (const ls of localSessions) {
      if (!merged.find((b: any) => b.id === ls.id)) merged.push(ls);
    }
    merged.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    setSessions(merged);
    saveSessions(merged);
  }).catch(() => {});
}, [user]);
```

Modify `createSession` to also sync to backend. Find the createSession function and add after the session is created:
```typescript
if (user) {
  apiCreateSession({ name: session.name, model_id: session.modelId }).catch(() => {});
}
```

Modify `saveSession` (the localStorage helper) — also add a sync call. In the `addMessage` function, after saving locally, add:
```typescript
if (user) {
  apiUpdateSession(sessionId, { messages: updated.messages as any }).catch(() => {});
}
```

And in `removeSession`, after local deletion, add:
```typescript
if (user) {
  apiDeleteSession(sessionId).catch(() => {});
}
```

Import `saveSession as saveSessionToStorage, deleteSession as deleteSessionFromStorage` from utils/storage, or use the existing imports. The import `import { getSessions, saveSession, deleteSession } from '@/utils/storage'` already exists.

Note: The function `getSessions` is imported from utils/storage, and the API function also named `getSessions`. The import I wrote above uses `fetchBackendSessions` as the alias for the API function to avoid name collision.

## Step 3: Verify typecheck and commit

```bash
cd packages/console-ui && pnpm typecheck
git add packages/console-ui/src
git commit -m "feat: add Playground backend session persistence with API sync"
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