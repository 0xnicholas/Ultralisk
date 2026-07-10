# Task for worker

Implement Phase 2e Tasks 1+2: Organization settings

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

All Phase 2a-d done. Add Organization management.

## TASK 1: Stub API

Read `packages/console-api/src/fixtures.ts`. Append at end:
```typescript
export const MOCK_ORGANIZATION = {
  id: 'org_001', name: 'Ultralisk Labs', billing_email: 'billing@ultralisk.com',
  plan: 'pro', created_at: '2026-01-01T00:00:00Z',
  members: [
    { id: 'usr_001', email: 'alice@ultralisk.com', name: 'Alice Developer', role: 'admin', joined_at: '2026-01-01T00:00:00Z' },
    { id: 'usr_002', email: 'bob@ultralisk.com', name: 'Bob Engineer', role: 'developer', joined_at: '2026-02-15T00:00:00Z' },
    { id: 'usr_003', email: 'carol@ultralisk.com', name: 'Carol Viewer', role: 'readonly', joined_at: '2026-03-01T00:00:00Z' },
  ],
  projects: [
    { id: 'proj_001', name: 'Production', member_count: 2 },
    { id: 'proj_002', name: 'Development', member_count: 3 },
    { id: 'proj_003', name: 'ML Research', member_count: 1 },
  ],
};
```

Read `packages/console-api/src/index.ts`. Add import and handlers:
```typescript
import { ..., MOCK_ORGANIZATION } from './fixtures.js';

// === Organization (Phase 2e) ===
app.get('/v1/admin/organization', (_req, res) => res.json({ data: MOCK_ORGANIZATION }));
app.patch('/v1/admin/organization', (req, res) => { Object.assign(MOCK_ORGANIZATION, req.body); res.json({ data: MOCK_ORGANIZATION }); });
```

Commit:
```bash
git add packages/console-api/src && git commit -m "feat(api): add Organization stub endpoint"
```

## TASK 2: UI — Types, API, Hook, Page, Sidebar, Route

### Types
Read `packages/console-ui/src/types/index.ts`. Append:
```typescript
// === Organization (Phase 2e) ===
export interface OrgMember { id: string; email: string; name: string; role: string; joined_at: string; }
export interface OrgProject { id: string; name: string; member_count: number; }
export interface Organization { id: string; name: string; billing_email: string; plan: string; created_at: string; members: OrgMember[]; projects: OrgProject[]; }
```

### API + Hook
Create `packages/console-ui/src/api/organization.ts`:
```typescript
import { apiFetch } from './client';
import type { SingleResponse, Organization } from '@/types';
export async function getOrganization() { return apiFetch<SingleResponse<Organization>>('/v1/admin/organization'); }
export async function updateOrganization(data: Partial<Organization>) { return apiFetch<SingleResponse<Organization>>('/v1/admin/organization', { method: 'PATCH', body: JSON.stringify(data) }); }
```

Create `packages/console-ui/src/hooks/useOrganization.ts`:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getOrganization, updateOrganization } from '@/api/organization';
export function useOrganization() { return useQuery({ queryKey: ['organization'], queryFn: () => getOrganization().then((r) => r.data) }); }
export function useUpdateOrganization() { const qc = useQueryClient(); return useMutation({ mutationFn: (d: Partial<Organization>) => updateOrganization(d).then((r) => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['organization'] }) }); }
```

### Organization Page
Create `packages/console-ui/src/pages/settings/OrganizationPage.tsx`:
```typescript
import { Title, Paper, Text, Group, Badge, Table, Button, TextInput, Stack, SimpleGrid, Skeleton } from '@mantine/core';
import { IconUserPlus, IconBuilding } from '@tabler/icons-react';
import { useOrganization } from '@/hooks/useOrganization';
import { formatRelativeTime } from '@/utils/format';

const roleColors: Record<string, string> = { admin: 'red', developer: 'blue', readonly: 'gray' };

export function OrganizationPage() {
  const { data: org, isLoading } = useOrganization();
  if (isLoading) return <Skeleton height={400} />;
  if (!org) return null;

  return (
    <>
      <Title order={2} mb="md">Organization</Title>

      <SimpleGrid cols={{ base: 1, md: 2 }} mb="md">
        <Paper withBorder p="lg" radius="md">
          <Group mb="sm"><IconBuilding size={20} /><Text size="sm" fw={500}>General</Text></Group>
          <Stack gap="xs">
            <Group><Text size="sm" fw={500}>Name:</Text><Text size="sm">{org.name}</Text></Group>
            <Group><Text size="sm" fw={500}>Plan:</Text><Badge variant="light" color="violet">{org.plan}</Badge></Group>
            <Group><Text size="sm" fw={500}>Billing Email:</Text><Text size="sm">{org.billing_email}</Text></Group>
            <Group><Text size="sm" fw={500}>Created:</Text><Text size="sm">{new Date(org.created_at).toLocaleDateString()}</Text></Group>
          </Stack>
        </Paper>

        <Paper withBorder p="lg" radius="md">
          <Text size="sm" fw={500} mb="sm">Projects ({org.projects.length})</Text>
          <Table striped>
            <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Members</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{org.projects.map((p) => (
              <Table.Tr key={p.id}><Table.Td><Text size="sm">{p.name}</Text></Table.Td><Table.Td><Badge variant="light" size="sm">{p.member_count}</Badge></Table.Td></Table.Tr>
            ))}</Table.Tbody>
          </Table>
        </Paper>
      </SimpleGrid>

      <Paper withBorder p="lg" radius="md">
        <Group justify="space-between" mb="md">
          <Text size="sm" fw={500}>Members ({org.members.length})</Text>
          <Button size="xs" variant="light" leftSection={<IconUserPlus size={14} />}>Invite Member</Button>
        </Group>
        <Table striped highlightOnHover>
          <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Email</Table.Th><Table.Th>Role</Table.Th><Table.Th>Joined</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>{org.members.map((m) => (
            <Table.Tr key={m.id}>
              <Table.Td><Text size="sm" fw={500}>{m.name}</Text></Table.Td>
              <Table.Td><Text size="sm">{m.email}</Text></Table.Td>
              <Table.Td><Badge variant="light" color={roleColors[m.role]} size="sm">{m.role}</Badge></Table.Td>
              <Table.Td><Text size="sm">{formatRelativeTime(m.joined_at)}</Text></Table.Td>
            </Table.Tr>
          ))}</Table.Tbody>
        </Table>
      </Paper>
    </>
  );
}
```

### Route + Sidebar

Read App.tsx. Add import:
```typescript
import { OrganizationPage } from '@/pages/settings/OrganizationPage';
import { IconBuilding } from '@tabler/icons-react'; // for sidebar
```

Add route inside ConsoleLayout:
```typescript
<Route path="/settings/organization" element={<OrganizationPage />} />
```

Read Sidebar.tsx. Add `IconBuilding` to imports. Add item to Organization section:
```typescript
{ label: 'Organization', icon: IconBuilding, path: '/settings/organization' },
```

### Commit
```bash
cd packages/console-ui && pnpm typecheck
git add packages/console-ui/src packages/console-api/src
git commit -m "feat: add Organization page with members, projects, and RBAC roles"
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