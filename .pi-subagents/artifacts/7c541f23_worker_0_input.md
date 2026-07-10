# Task for worker

You are implementing Phase 2a Task 3: Clusters Page

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

Tasks 1-2 done. Types, sidebar, routes are in place. Create Clusters page.

## Step 1: Create API + hooks

Create `packages/console-ui/src/api/clusters.ts`:
```typescript
import { apiFetch } from './client';
import type { PaginatedResponse, SingleResponse, Cluster, ClusterDetail } from '@/types';

export async function getClusters() { return apiFetch<PaginatedResponse<Cluster>>('/v1/admin/clusters'); }
export async function getCluster(id: string) { return apiFetch<SingleResponse<ClusterDetail>>(`/v1/admin/clusters/${id}`); }
```

Create `packages/console-ui/src/hooks/useClusters.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { getClusters, getCluster } from '@/api/clusters';

export function useClusters() { return useQuery({ queryKey: ['clusters'], queryFn: () => getClusters().then((r) => r.data) }); }
export function useCluster(id: string) { return useQuery({ queryKey: ['clusters', id], queryFn: () => getCluster(id).then((r) => r.data), enabled: !!id }); }
```

## Step 2: Create ClusterList

Create `packages/console-ui/src/components/clusters/ClusterList.tsx`:
```typescript
import { Table, Badge, Text, Group, ActionIcon, Skeleton, Tooltip, Progress } from '@mantine/core';
import { IconEye } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useClusters } from '@/hooks/useClusters';
import type { Cluster } from '@/types';

export function ClusterList() {
  const { data: clusters, isLoading } = useClusters();
  const navigate = useNavigate();
  const rows = (clusters ?? []).map((c: Cluster) => (
    <Table.Tr key={c.id}>
      <Table.Td><Text size="sm" fw={500}>{c.name}</Text><Text size="xs" c="dimmed">{c.region}</Text></Table.Td>
      <Table.Td><Badge variant="light" size="sm">{c.gpu_type}</Badge></Table.Td>
      <Table.Td><Text size="sm">{c.healthy_nodes}/{c.node_count}</Text></Table.Td>
      <Table.Td><Group gap="xs"><Progress value={c.avg_gpu_util} size="sm" w={80} color={c.avg_gpu_util > 80 ? 'red' : c.avg_gpu_util > 60 ? 'yellow' : 'green'} /><Text size="xs">{c.avg_gpu_util}%</Text></Group></Table.Td>
      <Table.Td><Badge variant="dot" size="sm" color={c.status === 'healthy' ? 'green' : 'yellow'}>{c.status}</Badge></Table.Td>
      <Table.Td><Tooltip label="View cluster"><ActionIcon variant="light" size="sm" onClick={() => navigate(`/clusters/${c.id}`)}><IconEye size={14} /></ActionIcon></Tooltip></Table.Td>
    </Table.Tr>
  ));
  return (
    <Table striped highlightOnHover>
      <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>GPU</Table.Th><Table.Th>Nodes</Table.Th><Table.Th>Avg GPU Util</Table.Th><Table.Th>Status</Table.Th><Table.Th></Table.Th></Table.Tr></Table.Thead>
      <Table.Tbody>{isLoading ? [1,2,3].map((i) => <Table.Tr key={i}>{[1,2,3,4,5,6].map((j) => <Table.Td key={j}><Skeleton height={20} /></Table.Td>)}</Table.Tr>) : rows}</Table.Tbody>
    </Table>
  );
}
```

## Step 3: Create ClustersPage (overwrite placeholder)

Write `packages/console-ui/src/pages/clusters/ClustersPage.tsx`:
```typescript
import { Title, Paper, SimpleGrid, Text, Group, ThemeIcon } from '@mantine/core';
import { IconServer, IconCpu, IconAlertTriangle, IconActivity } from '@tabler/icons-react';
import { ClusterList } from '@/components/clusters/ClusterList';
import { useClusters } from '@/hooks/useClusters';

export function ClustersPage() {
  const { data: clusters } = useClusters();
  const totalGpu = (clusters ?? []).reduce((s, c) => s + c.node_count * (c.gpu_type === 'H100' ? 8 : 4), 0);
  const avgUtil = clusters?.length ? Math.round(clusters.reduce((s, c) => s + c.avg_gpu_util, 0) / clusters.length) : 0;
  const degraded = (clusters ?? []).filter((c) => c.status === 'degraded').length;
  const cards = [
    { label: 'Total Clusters', value: clusters?.length ?? '-', icon: IconServer, color: 'blue' },
    { label: 'Total GPUs', value: totalGpu.toLocaleString(), icon: IconCpu, color: 'violet' },
    { label: 'Avg Utilization', value: `${avgUtil}%`, icon: IconActivity, color: avgUtil > 80 ? 'red' : 'green' as string },
    { label: 'Degraded', value: degraded, icon: IconAlertTriangle, color: degraded > 0 ? 'yellow' : 'green' as string },
  ];
  return (
    <>
      <Title order={2} mb="md">Clusters</Title>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="md">
        {cards.map((card) => (
          <Paper key={card.label} withBorder p="md" radius="md">
            <Group><ThemeIcon variant="light" color={card.color} size="lg"><card.icon size={20} /></ThemeIcon>
              <div><Text size="xs" c="dimmed" tt="uppercase" fw={700}>{card.label}</Text><Text fw={700} size="lg">{card.value}</Text></div>
            </Group>
          </Paper>
        ))}
      </SimpleGrid>
      <Paper withBorder p="lg" radius="md"><ClusterList /></Paper>
    </>
  );
}
```

## Step 4: Create ClusterDetailPage (overwrite placeholder)

Write `packages/console-ui/src/pages/clusters/ClusterDetailPage.tsx`:
```typescript
import { useParams, useNavigate } from 'react-router-dom';
import { Title, Paper, Text, Group, Button, Skeleton, SimpleGrid, Progress, Table, Badge } from '@mantine/core';
import { IconArrowLeft, IconCpu } from '@tabler/icons-react';
import { useCluster } from '@/hooks/useClusters';

export function ClusterDetailPage() {
  const { id } = useParams<{ id: string }>(); const navigate = useNavigate();
  const { data: cluster, isLoading } = useCluster(id ?? '');
  if (isLoading) return <Skeleton height={400} />;
  if (!cluster) return <Text c="red">Cluster not found</Text>;

  return (
    <>
      <Group mb="md"><Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/clusters')}>Back</Button></Group>
      <Group mb="md">
        <div><Title order={2}>{cluster.name}</Title><Group gap="xs"><Text c="dimmed" size="sm">{cluster.region}</Text><Badge variant="light" size="sm">{cluster.gpu_type}</Badge></Group></div>
        <Badge variant="dot" size="lg" color={cluster.status === 'healthy' ? 'green' : 'yellow'} ml="auto">{cluster.status}</Badge>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="md">
        <Paper withBorder p="md" radius="md"><Text size="xs" c="dimmed" tt="uppercase">Nodes</Text><Text fw={700} size="lg">{cluster.healthy_nodes}/{cluster.node_count}</Text></Paper>
        <Paper withBorder p="md" radius="md"><Text size="xs" c="dimmed" tt="uppercase">Total GPUs</Text><Text fw={700} size="lg">{cluster.total_gpu}</Text></Paper>
        <Paper withBorder p="md" radius="md"><Text size="xs" c="dimmed" tt="uppercase">Avg GPU Util</Text><Group gap="xs"><Progress value={cluster.avg_gpu_util} size="lg" w={80} color={cluster.avg_gpu_util > 80 ? 'red' : cluster.avg_gpu_util > 60 ? 'yellow' : 'green'} /><Text fw={700} size="lg">{cluster.avg_gpu_util}%</Text></Group></Paper>
        <Paper withBorder p="md" radius="md"><Text size="xs" c="dimmed" tt="uppercase">GPU Type</Text><Text fw={700} size="lg">{cluster.gpu_type}</Text></Paper>
      </SimpleGrid>
      <Title order={4} mb="sm">Nodes</Title>
      <Paper withBorder p="lg" radius="md">
        <Table striped highlightOnHover>
          <Table.Thead><Table.Tr><Table.Th>Hostname</Table.Th><Table.Th>GPU</Table.Th><Table.Th>GPUs</Table.Th><Table.Th>Driver</Table.Th><Table.Th>CUDA</Table.Th><Table.Th>Status</Table.Th><Table.Th></Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>{(cluster.nodes ?? []).map((node: any) => (
            <Table.Tr key={node.id}>
              <Table.Td><Text size="sm" fw={500}>{node.hostname}</Text></Table.Td>
              <Table.Td><Badge variant="light" size="sm">{node.gpu_model}</Badge></Table.Td>
              <Table.Td><Text size="sm">{node.gpu_count}</Text></Table.Td>
              <Table.Td><Text size="xs" c="dimmed">{node.driver_version}</Text></Table.Td>
              <Table.Td><Text size="xs" c="dimmed">{node.cuda_version}</Text></Table.Td>
              <Table.Td><Badge variant="dot" size="sm" color={node.status === 'online' ? 'green' : node.status === 'degraded' ? 'yellow' : 'red'}>{node.status}</Badge></Table.Td>
              <Table.Td><Button size="xs" variant="light" leftSection={<IconCpu size={12} />} onClick={() => navigate(`/clusters/${cluster.id}/nodes/${node.id}`)}>GPUs</Button></Table.Td>
            </Table.Tr>
          ))}</Table.Tbody>
        </Table>
      </Paper>
    </>
  );
}
```

## Step 5: Commit

```bash
cd packages/console-ui && pnpm typecheck
git add packages/console-ui/src
git commit -m "feat: add Clusters page with summary cards, list, and detail view with node table"
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