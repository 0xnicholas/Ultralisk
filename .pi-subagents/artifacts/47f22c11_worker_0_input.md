# Task for worker

You are implementing Phase 2a Task 4: Nodes Page

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

Tasks 1-3 done. Create the Nodes pages.

## Step 1: Create API + hooks

Create `packages/console-ui/src/api/nodes.ts`:
```typescript
import { apiFetch } from './client';
import type { PaginatedResponse, SingleResponse, Node, NodeDetail } from '@/types';

export async function getNodes() { return apiFetch<PaginatedResponse<Node>>('/v1/admin/nodes'); }
export async function getNode(id: string) { return apiFetch<SingleResponse<NodeDetail>>(`/v1/admin/nodes/${id}`); }
export async function getClusterNode(clusterId: string, nodeId: string) { return apiFetch<SingleResponse<NodeDetail>>(`/v1/admin/clusters/${clusterId}/nodes/${nodeId}`); }
```

Create `packages/console-ui/src/hooks/useNodes.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { getNodes, getNode, getClusterNode } from '@/api/nodes';

export function useNodes() { return useQuery({ queryKey: ['nodes'], queryFn: () => getNodes().then((r) => r.data) }); }
export function useNode(id: string) { return useQuery({ queryKey: ['nodes', id], queryFn: () => getNode(id).then((r) => r.data), enabled: !!id }); }
export function useClusterNode(clusterId: string, nodeId: string) { return useQuery({ queryKey: ['nodes', clusterId, nodeId], queryFn: () => getClusterNode(clusterId, nodeId).then((r) => r.data), enabled: !!clusterId && !!nodeId }); }
```

## Step 2: Create NodeList

Create `packages/console-ui/src/components/nodes/NodeList.tsx`:
```typescript
import { Table, Badge, Text, ActionIcon, Skeleton, Tooltip } from '@mantine/core';
import { IconEye } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useNodes } from '@/hooks/useNodes';
import type { Node } from '@/types';

export function NodeList() {
  const { data: nodes, isLoading } = useNodes(); const navigate = useNavigate();
  const rows = (nodes ?? []).map((n: Node) => (
    <Table.Tr key={n.id}>
      <Table.Td><Text size="sm" fw={500}>{n.hostname}</Text><Text size="xs" c="dimmed">{n.id}</Text></Table.Td>
      <Table.Td><Badge variant="light" size="sm">{n.gpu_model}</Badge></Table.Td>
      <Table.Td><Text size="sm">{n.gpu_count}</Text></Table.Td>
      <Table.Td><Text size="xs" c="dimmed">{n.driver_version}</Text></Table.Td>
      <Table.Td><Text size="xs" c="dimmed">{n.cuda_version}</Text></Table.Td>
      <Table.Td><Badge variant="dot" size="sm" color={n.status === 'online' ? 'green' : n.status === 'degraded' ? 'yellow' : 'red'}>{n.status}</Badge></Table.Td>
      <Table.Td><Tooltip label="View GPUs"><ActionIcon variant="light" size="sm" onClick={() => navigate(`/nodes/${n.id}`)}><IconEye size={14} /></ActionIcon></Tooltip></Table.Td>
    </Table.Tr>
  ));
  return (
    <Table striped highlightOnHover>
      <Table.Thead><Table.Tr><Table.Th>Hostname</Table.Th><Table.Th>GPU</Table.Th><Table.Th>Count</Table.Th><Table.Th>Driver</Table.Th><Table.Th>CUDA</Table.Th><Table.Th>Status</Table.Th><Table.Th></Table.Th></Table.Tr></Table.Thead>
      <Table.Tbody>{isLoading ? [1,2,3].map((i) => <Table.Tr key={i}>{[1,2,3,4,5,6,7].map((j) => <Table.Td key={j}><Skeleton height={20} /></Table.Td>)}</Table.Tr>) : rows}</Table.Tbody>
    </Table>
  );
}
```

## Step 3: Create GpuCardGrid

Create `packages/console-ui/src/components/nodes/GpuCardGrid.tsx`:
```typescript
import { SimpleGrid, Paper, Text, Group, Progress, Badge } from '@mantine/core';
import type { GpuCard } from '@/types';

export function GpuCardGrid({ cards }: { cards: GpuCard[] }) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="md">
      {cards.map((gpu) => {
        const memPct = Math.round((gpu.memory_used / gpu.memory_total) * 100);
        return (
          <Paper key={gpu.id} withBorder p="md" radius="md">
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={600}>GPU {gpu.index}</Text>
              <Badge size="xs" color={gpu.processes.length > 0 ? 'green' : 'gray'} variant="light">{gpu.processes.length} procs</Badge>
            </Group>
            <Group mb={4}><Text size="xs" c="dimmed">Util</Text><Text size="xs" fw={500}>{gpu.utilization_percent}%</Text></Group>
            <Progress value={gpu.utilization_percent} size="sm" color={gpu.utilization_percent > 80 ? 'red' : gpu.utilization_percent > 50 ? 'yellow' : 'green'} mb="xs" />
            <Group mb={4}><Text size="xs" c="dimmed">Memory</Text><Text size="xs" fw={500}>{gpu.memory_used}/{gpu.memory_total} GB</Text></Group>
            <Progress value={memPct} size="sm" color={memPct > 80 ? 'red' : 'blue'} mb="xs" />
            <Group><Text size="xs" c="dimmed">Temp</Text><Text size="xs" fw={500} c={gpu.temperature > 80 ? 'red' : gpu.temperature > 70 ? 'yellow' : 'green'}>{gpu.temperature}°C</Text></Group>
            {gpu.processes.length > 0 && (
              <Paper p="xs" mt="xs" style={{ borderRadius: 4, backgroundColor: 'var(--mantine-color-dark-8)' }}>
                <Text size="xs" c="dimmed">Processes:</Text>
                {gpu.processes.map((p) => <Text key={p.pid} size="xs" ff="mono">{p.name} ({p.memory_mb}MB)</Text>)}
              </Paper>
            )}
          </Paper>
        );
      })}
    </SimpleGrid>
  );
}
```

## Step 4: Create NodesPage (overwrite placeholder)

Write `packages/console-ui/src/pages/nodes/NodesPage.tsx`:
```typescript
import { Title, Paper } from '@mantine/core';
import { NodeList } from '@/components/nodes/NodeList';

export function NodesPage() { return (<><Title order={2} mb="md">Nodes</Title><Paper withBorder p="lg" radius="md"><NodeList /></Paper></>); }
```

## Step 5: Create NodeDetailPage (overwrite placeholder)

Write `packages/console-ui/src/pages/nodes/NodeDetailPage.tsx`:
```typescript
import { useParams, useNavigate } from 'react-router-dom';
import { Title, Paper, Text, Group, Button, Skeleton, SimpleGrid } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useNode, useClusterNode } from '@/hooks/useNodes';
import { GpuCardGrid } from '@/components/nodes/GpuCardGrid';
import { AreaChart } from '@mantine/charts';

export function NodeDetailPage() {
  const { nodeId, clusterId } = useParams<{ nodeId: string; clusterId?: string }>();
  const navigate = useNavigate();
  const { data: node, isLoading } = clusterId ? useClusterNode(clusterId!, nodeId!) : useNode(nodeId!);

  if (isLoading) return <Skeleton height={400} />;
  if (!node) return <Text c="red">Node not found</Text>;

  const avgUtil = node.gpu_cards?.length ? Math.round(node.gpu_cards.reduce((s, g) => s + g.utilization_percent, 0) / node.gpu_cards.length) : 0;
  const avgTemp = node.gpu_cards?.length ? Math.round(node.gpu_cards.reduce((s, g) => s + g.temperature, 0) / node.gpu_cards.length) : 0;
  const firstGpu = node.gpu_cards?.[0];
  const chartData = firstGpu?.metrics?.slice(0, 20)?.map((m) => ({ time: new Date(m.timestamp).toLocaleTimeString(), Utilization: m.value })) ?? [];

  return (
    <>
      <Group mb="md"><Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => clusterId ? navigate(`/clusters/${clusterId}`) : navigate('/nodes')}>Back</Button></Group>
      <Group mb="md">
        <div><Title order={2}>{node.hostname}</Title><Group gap="xs"><Text c="dimmed" size="sm">{node.gpu_model} · {node.gpu_count} GPUs</Text></Group></div>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 3 }} mb="md">
        <Paper withBorder p="md" radius="md"><Text size="xs" c="dimmed" tt="uppercase">Avg GPU Util</Text><Text fw={700} size="xl">{avgUtil}%</Text></Paper>
        <Paper withBorder p="md" radius="md"><Text size="xs" c="dimmed" tt="uppercase">Avg Temperature</Text><Text fw={700} size="xl">{avgTemp}°C</Text></Paper>
        <Paper withBorder p="md" radius="md"><Text size="xs" c="dimmed" tt="uppercase">Driver / CUDA</Text><Text fw={500} size="sm">{node.driver_version} / {node.cuda_version}</Text></Paper>
      </SimpleGrid>
      {chartData.length > 0 && (
        <Paper withBorder p="lg" radius="md" mb="md">
          <Text size="sm" fw={500} mb="sm">GPU Utilization (last 40 min)</Text>
          <AreaChart h={200} data={chartData} dataKey="time" series={[{ name: 'Utilization', color: 'violet.6' }]} curveType="natural" tickLine="none" gridAxis="y" withYAxis={false} />
        </Paper>
      )}
      <Title order={4} mb="sm">GPU Cards ({node.gpu_cards?.length ?? 0})</Title>
      <GpuCardGrid cards={node.gpu_cards ?? []} />
    </>
  );
}
```

## Step 6: Commit

```bash
cd packages/console-ui && pnpm typecheck
git add packages/console-ui/src
git commit -m "feat: add Nodes page with list, detail view, GPU card grid, and time-series chart"
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