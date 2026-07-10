# Task for worker

You are implementing Phase 2a Task 5: Deployments Page

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

Tasks 1-4 done. Create the Deployments page.

## Step 1: Create API + hooks

Create `packages/console-ui/src/api/deployments.ts`:
```typescript
import { apiFetch } from './client';
import type { PaginatedResponse, SingleResponse, Deployment, DeploymentDetail } from '@/types';

export async function getDeployments() { return apiFetch<PaginatedResponse<Deployment>>('/v1/admin/deployments'); }
export async function getDeployment(id: string) { return apiFetch<SingleResponse<DeploymentDetail>>(`/v1/admin/deployments/${id}`); }
export async function scaleDeployment(id: string, replicas: number) { return apiFetch<SingleResponse<Deployment>>(`/v1/admin/deployments/${id}/scale`, { method: 'POST', body: JSON.stringify({ replicas }) }); }
export async function rollbackDeployment(id: string) { return apiFetch<SingleResponse<Deployment>>(`/v1/admin/deployments/${id}/rollback`, { method: 'POST' }); }
```

Create `packages/console-ui/src/hooks/useDeployments.ts`:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDeployments, getDeployment, scaleDeployment, rollbackDeployment } from '@/api/deployments';

export function useDeployments() { return useQuery({ queryKey: ['deployments'], queryFn: () => getDeployments().then((r) => r.data) }); }
export function useDeployment(id: string) { return useQuery({ queryKey: ['deployments', id], queryFn: () => getDeployment(id).then((r) => r.data), enabled: !!id }); }
export function useScaleDeployment() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, replicas }: { id: string; replicas: number }) => scaleDeployment(id, replicas), onSuccess: () => qc.invalidateQueries({ queryKey: ['deployments'] }) }); }
export function useRollbackDeployment() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => rollbackDeployment(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['deployments'] }) }); }
```

## Step 2: Create DeploymentList

Create `packages/console-ui/src/components/deployments/DeploymentList.tsx`:
```typescript
import { Table, Badge, Text, Group, ActionIcon, Skeleton, Tooltip } from '@mantine/core';
import { IconEye } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useDeployments } from '@/hooks/useDeployments';
import type { Deployment } from '@/types';

export function DeploymentList() {
  const { data: deployments, isLoading } = useDeployments();
  const navigate = useNavigate();
  const rows = (deployments ?? []).map((d: Deployment) => (
    <Table.Tr key={d.id}>
      <Table.Td><Text size="sm" fw={500}>{d.name}</Text><Text size="xs" c="dimmed">{d.model_id}</Text></Table.Td>
      <Table.Td><Text size="sm">{d.replicas}</Text></Table.Td>
      <Table.Td><Text size="sm">{d.gpu_per_replica} GPU</Text></Table.Td>
      <Table.Td><Badge variant="light" size="sm">{d.cluster_id}</Badge></Table.Td>
      <Table.Td><Badge variant="dot" size="sm" color={d.status === 'active' ? 'green' : d.status === 'degraded' ? 'yellow' : 'blue'}>{d.status}</Badge></Table.Td>
      <Table.Td><Group gap={4}><Tooltip label="View details"><ActionIcon variant="light" size="sm" onClick={() => navigate(`/deployments/${d.id}`)}><IconEye size={14} /></ActionIcon></Tooltip></Group></Table.Td>
    </Table.Tr>
  ));
  return (
    <Table striped highlightOnHover>
      <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Replicas</Table.Th><Table.Th>GPU/Rep</Table.Th><Table.Th>Cluster</Table.Th><Table.Th>Status</Table.Th><Table.Th></Table.Th></Table.Tr></Table.Thead>
      <Table.Tbody>{isLoading ? [1,2,3].map((i) => <Table.Tr key={i}>{[1,2,3,4,5,6].map((j) => <Table.Td key={j}><Skeleton height={20} /></Table.Td>)}</Table.Tr>) : rows}</Table.Tbody>
    </Table>
  );
}
```

## Step 3: Create DeploymentsPage (overwrite placeholder)

Write `packages/console-ui/src/pages/deployments/DeploymentsPage.tsx`:
```typescript
import { Title, Paper } from '@mantine/core';
import { DeploymentList } from '@/components/deployments/DeploymentList';

export function DeploymentsPage() { return (<><Title order={2} mb="md">Deployments</Title><Paper withBorder p="lg" radius="md"><DeploymentList /></Paper></>); }
```

## Step 4: Create DeploymentDetailPage (overwrite placeholder)

Write `packages/console-ui/src/pages/deployments/DeploymentDetailPage.tsx`:
```typescript
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Title, Paper, Text, Group, Button, Skeleton, Badge, Table, NumberInput, SimpleGrid } from '@mantine/core';
import { IconArrowLeft, IconRefresh } from '@tabler/icons-react';
import { useDeployment, useScaleDeployment, useRollbackDeployment } from '@/hooks/useDeployments';
import { formatRelativeTime } from '@/utils/format';

export function DeploymentDetailPage() {
  const { id } = useParams<{ id: string }>(); const navigate = useNavigate();
  const { data: dep, isLoading } = useDeployment(id ?? '');
  const scaleMutation = useScaleDeployment(); const rollbackMutation = useRollbackDeployment();
  const [replicas, setReplicas] = useState(1);
  // Sync replicas from API data when loaded
  useEffect(() => { if (dep?.replicas !== undefined) { setReplicas(dep.replicas); } }, [dep?.replicas]);

  if (isLoading) return <Skeleton height={400} />;
  if (!dep) return <Text c="red">Deployment not found</Text>;

  return (
    <>
      <Group mb="md"><Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/deployments')}>Back</Button></Group>
      <Group justify="space-between" mb="md">
        <div><Title order={2}>{dep.name}</Title><Group gap="xs"><Text c="dimmed" size="sm">{dep.model_id}</Text><Badge variant="light" size="sm">{dep.cluster_id}</Badge></Group></div>
        <Badge variant="dot" size="lg" color={dep.status === 'active' ? 'green' : dep.status === 'degraded' ? 'yellow' : 'blue'}>{dep.status}</Badge>
      </Group>
      <SimpleGrid cols={{ base: 1, md: 2 }} mb="md">
        <Paper withBorder p="lg" radius="md">
          <Text size="sm" fw={500} mb="sm">Scale</Text>
          <Group><NumberInput value={replicas} onChange={(v) => setReplicas(typeof v === 'number' ? v : 1)} min={0} max={20} w={100} />
            <Button size="sm" onClick={() => scaleMutation.mutate({ id: dep.id, replicas })} loading={scaleMutation.isPending} disabled={replicas === dep.replicas}>Scale</Button></Group>
          <Text size="xs" c="dimmed" mt={4}>Current: {dep.replicas} replicas · {dep.gpu_per_replica} GPU each</Text>
        </Paper>
        <Paper withBorder p="lg" radius="md">
          <Text size="sm" fw={500} mb="sm">Rollback</Text>
          <Button variant="light" color="orange" leftSection={<IconRefresh size={16} />} onClick={() => rollbackMutation.mutate(dep.id)} loading={rollbackMutation.isPending}>Rollback to Previous</Button>
          <Text size="xs" c="dimmed" mt={4}>Rolls back to the last active version</Text>
        </Paper>
      </SimpleGrid>
      {dep.versions && dep.versions.length > 0 && (
        <Paper withBorder p="lg" radius="md">
          <Text size="sm" fw={500} mb="sm">Version History</Text>
          <Table striped highlightOnHover>
            <Table.Thead><Table.Tr><Table.Th>Version</Table.Th><Table.Th>Image</Table.Th><Table.Th>Deployed</Table.Th><Table.Th>Status</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{dep.versions.map((v: any) => (
              <Table.Tr key={v.version}>
                <Table.Td><Text fw={500}>v{v.version}</Text></Table.Td>
                <Table.Td><Text size="xs" ff="mono">{v.image}</Text></Table.Td>
                <Table.Td><Text size="sm">{formatRelativeTime(v.deployed_at)}</Text></Table.Td>
                <Table.Td><Badge variant="light" size="sm" color={v.status === 'active' ? 'green' : 'gray'}>{v.status}</Badge></Table.Td>
              </Table.Tr>
            ))}</Table.Tbody>
          </Table>
        </Paper>
      )}
    </>
  );
}
```

## Step 5: Commit

```bash
cd packages/console-ui && pnpm typecheck
git add packages/console-ui/src
git commit -m "feat: add Deployments page with list, detail, scale controls, rollback, and version history"
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