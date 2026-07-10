# Task for worker

You are implementing Task 3: Endpoints Page

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

Tasks 1-2 done. Types and routes are in place. Create all Endpoints page components.

## Step 1: Create API and hooks

Create `packages/console-ui/src/api/endpoints.ts`:
```typescript
import { apiFetch } from './client';
import type { PaginatedResponse, SingleResponse, Endpoint, CreateEndpointRequest } from '@/types';

export async function getEndpoints() { return apiFetch<PaginatedResponse<Endpoint>>('/v1/admin/endpoints'); }
export async function getEndpoint(id: string) { return apiFetch<SingleResponse<Endpoint>>(`/v1/admin/endpoints/${id}`); }
export async function createEndpoint(data: CreateEndpointRequest) { return apiFetch<SingleResponse<Endpoint>>('/v1/admin/endpoints', { method: 'POST', body: JSON.stringify(data) }); }
export async function updateEndpoint(id: string, data: Partial<Endpoint>) { return apiFetch<SingleResponse<Endpoint>>(`/v1/admin/endpoints/${id}`, { method: 'PATCH', body: JSON.stringify(data) }); }
export async function deleteEndpoint(id: string) { return apiFetch<void>(`/v1/admin/endpoints/${id}`, { method: 'DELETE' }); }
```

Create `packages/console-ui/src/hooks/useEndpoints.ts`:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEndpoints, getEndpoint, createEndpoint, updateEndpoint, deleteEndpoint } from '@/api/endpoints';
import type { CreateEndpointRequest } from '@/types';

export function useEndpoints() { return useQuery({ queryKey: ['endpoints'], queryFn: () => getEndpoints().then((r) => r.data) }); }
export function useEndpoint(id: string) { return useQuery({ queryKey: ['endpoints', id], queryFn: () => getEndpoint(id).then((r) => r.data), enabled: !!id }); }
export function useCreateEndpoint() { const qc = useQueryClient(); return useMutation({ mutationFn: (d: CreateEndpointRequest) => createEndpoint(d).then((r) => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['endpoints'] }) }); }
export function useDeleteEndpoint() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => deleteEndpoint(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['endpoints'] }) }); }
```

## Step 2: Create EndpointList

Create `packages/console-ui/src/components/endpoints/EndpointList.tsx`:
```typescript
import { Table, Badge, Text, Group, ActionIcon, Skeleton, Tooltip } from '@mantine/core';
import { IconEye, IconTrash } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useEndpoints, useDeleteEndpoint } from '@/hooks/useEndpoints';
import type { Endpoint } from '@/types';

export function EndpointList() {
  const { data: endpoints, isLoading } = useEndpoints();
  const deleteMutation = useDeleteEndpoint();
  const navigate = useNavigate();

  const rows = (endpoints ?? []).map((ep: Endpoint) => (
    <Table.Tr key={ep.id}>
      <Table.Td><Text size="sm" fw={500}>{ep.name}</Text><Text size="xs" c="dimmed">{ep.model_id}</Text></Table.Td>
      <Table.Td><Badge variant="light" size="sm" color={ep.type === 'dedicated' ? 'violet' : 'blue'}>{ep.type}</Badge></Table.Td>
      <Table.Td><Text size="sm">{ep.replicas}x {ep.gpu_spec.type}</Text></Table.Td>
      <Table.Td><Text size="sm">{ep.metrics.qps} QPS</Text></Table.Td>
      <Table.Td><Badge variant="dot" size="sm" color={ep.status === 'active' ? 'green' : ep.status === 'degraded' ? 'yellow' : 'red'}>{ep.status}</Badge></Table.Td>
      <Table.Td>
        <Group gap={4}>
          <Tooltip label="View details"><ActionIcon variant="light" size="sm" onClick={() => navigate(`/endpoints/${ep.id}`)}><IconEye size={14} /></ActionIcon></Tooltip>
          <Tooltip label="Delete"><ActionIcon variant="light" color="red" size="sm" onClick={() => deleteMutation.mutate(ep.id)} loading={deleteMutation.isPending}><IconTrash size={14} /></ActionIcon></Tooltip>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Table striped highlightOnHover>
      <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Type</Table.Th><Table.Th>GPU</Table.Th><Table.Th>Throughput</Table.Th><Table.Th>Status</Table.Th><Table.Th></Table.Th></Table.Tr></Table.Thead>
      <Table.Tbody>{isLoading ? [1,2,3].map((i) => <Table.Tr key={i}>{[1,2,3,4,5,6].map((j) => <Table.Td key={j}><Skeleton height={20} /></Table.Td>)}</Table.Tr>) : rows}</Table.Tbody>
    </Table>
  );
}
```

## Step 3: Create EndpointMetrics

Create `packages/console-ui/src/components/endpoints/EndpointMetrics.tsx`:
```typescript
import { Paper, SimpleGrid, Text } from '@mantine/core';
import type { Endpoint } from '@/types';

export function EndpointMetrics({ endpoint }: { endpoint: Endpoint }) {
  const metrics = [
    { label: 'QPS', value: endpoint.metrics.qps.toFixed(1), color: 'blue' },
    { label: 'TTFT p95', value: `${endpoint.metrics.ttft_p95_ms}ms`, color: 'violet' },
    { label: 'TPOT', value: `${endpoint.metrics.tpot_ms}ms`, color: 'green' },
    { label: 'Error Rate', value: `${endpoint.metrics.error_rate}%`, color: endpoint.metrics.error_rate > 1 ? 'red' : 'green' as string },
    { label: 'GPU Util', value: `${endpoint.metrics.gpu_util}%`, color: 'orange' },
  ];
  return (
    <SimpleGrid cols={5} mb="md">
      {metrics.map((m) => (
        <Paper key={m.label} withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{m.label}</Text>
          <Text size="lg" fw={700} c={m.color}>{m.value}</Text>
        </Paper>
      ))}
    </SimpleGrid>
  );
}
```

## Step 4: Create AutoscalingPolicy

Create `packages/console-ui/src/components/endpoints/AutoscalingPolicy.tsx`:
```typescript
import { Paper, Text, Group, Badge } from '@mantine/core';
import type { Endpoint } from '@/types';

export function AutoscalingPolicy({ endpoint }: { endpoint: Endpoint }) {
  if (!endpoint.autoscaling_policy) {
    return <Paper withBorder p="md" radius="md"><Text size="sm" c="dimmed">Autoscaling not configured</Text></Paper>;
  }
  const { min_replicas, max_replicas, target_cpu_util } = endpoint.autoscaling_policy;
  return (
    <Paper withBorder p="md" radius="md">
      <Text size="sm" fw={500} mb="xs">Autoscaling Policy</Text>
      <Group gap="md">
        <div><Text size="xs" c="dimmed">Min Replicas</Text><Text fw={600}>{min_replicas}</Text></div>
        <div><Text size="xs" c="dimmed">Max Replicas</Text><Text fw={600}>{max_replicas}</Text></div>
        <div><Text size="xs" c="dimmed">Target CPU</Text><Badge color="violet" variant="light">{target_cpu_util}%</Badge></div>
      </Group>
    </Paper>
  );
}
```

## Step 5: Create pages

Create `packages/console-ui/src/pages/endpoints/EndpointsPage.tsx` (overwrite placeholder):
```typescript
import { Title, Button, Group, Paper } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { EndpointList } from '@/components/endpoints/EndpointList';

export function EndpointsPage() {
  const navigate = useNavigate();
  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Endpoints</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/endpoints/new')}>Create Endpoint</Button>
      </Group>
      <Paper withBorder p="lg" radius="md"><EndpointList /></Paper>
    </>
  );
}
```

Create `packages/console-ui/src/pages/endpoints/CreateEndpointPage.tsx` (overwrite placeholder):
```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Title, Paper, TextInput, Select, NumberInput, Button, Group, Stack } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useCreateEndpoint } from '@/hooks/useEndpoints';
import { useModels } from '@/hooks/useModels';

export function CreateEndpointPage() {
  const navigate = useNavigate();
  const createMutation = useCreateEndpoint();
  const { data: models } = useModels();
  const [name, setName] = useState('');
  const [modelId, setModelId] = useState('');
  const [type, setType] = useState<'reserved' | 'dedicated'>('reserved');
  const [replicas, setReplicas] = useState(1);
  const modelOptions = (models ?? []).map((m) => ({ value: m.id, label: m.display_name }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMutation.mutateAsync({ name, model_id: modelId, type, replicas });
    navigate('/endpoints', { replace: true });
  };

  return (
    <>
      <Group mb="md"><Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/endpoints')}>Back</Button></Group>
      <Title order={2} mb="md">Create Endpoint</Title>
      <Paper withBorder p="lg" radius="md" maw={560}>
        <form onSubmit={handleSubmit}>
          <Stack>
            <TextInput label="Endpoint Name" placeholder="my-model-prod" required value={name} onChange={(e) => setName(e.currentTarget.value)} />
            <Select label="Model" placeholder="Select" data={modelOptions} value={modelId} onChange={(v) => v && setModelId(v)} searchable required />
            <Select label="Type" data={[{ value: 'reserved', label: 'Reserved' }, { value: 'dedicated', label: 'Dedicated' }]} value={type} onChange={(v) => setType(v as 'reserved' | 'dedicated')} />
            <NumberInput label="Replicas" value={replicas} onChange={(v) => setReplicas(typeof v === 'number' ? v : 1)} min={1} max={10} />
            <Group justify="flex-end"><Button variant="default" onClick={() => navigate('/endpoints')}>Cancel</Button><Button type="submit" loading={createMutation.isPending}>Create</Button></Group>
          </Stack>
        </form>
      </Paper>
    </>
  );
}
```

Create `packages/console-ui/src/pages/endpoints/EndpointDetailPage.tsx` (overwrite placeholder):
```typescript
import { useParams, useNavigate } from 'react-router-dom';
import { Title, Paper, Text, Group, Button, Skeleton, Stack, Badge, SimpleGrid } from '@mantine/core';
import { IconArrowLeft, IconTrash } from '@tabler/icons-react';
import { useEndpoint, useDeleteEndpoint } from '@/hooks/useEndpoints';
import { EndpointMetrics } from '@/components/endpoints/EndpointMetrics';
import { AutoscalingPolicy } from '@/components/endpoints/AutoscalingPolicy';

export function EndpointDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: endpoint, isLoading } = useEndpoint(id ?? '');
  const deleteMutation = useDeleteEndpoint();

  if (isLoading) return <Skeleton height={400} />;
  if (!endpoint) return <Text c="red">Endpoint not found</Text>;

  const handleDelete = async () => { await deleteMutation.mutateAsync(id!); navigate('/endpoints', { replace: true }); };

  return (
    <>
      <Group mb="md"><Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/endpoints')}>Back</Button></Group>
      <Group justify="space-between" mb="md">
        <div><Title order={2}>{endpoint.name}</Title><Group gap="xs"><Text c="dimmed" size="sm">{endpoint.model_id}</Text><Badge variant="light" size="sm">{endpoint.type}</Badge></Group></div>
        <Button color="red" variant="light" leftSection={<IconTrash size={16} />} onClick={handleDelete} loading={deleteMutation.isPending}>Delete</Button>
      </Group>
      <EndpointMetrics endpoint={endpoint} />
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Paper withBorder p="lg" radius="md">
          <Text size="sm" fw={500} mb="sm">Configuration</Text>
          <Stack gap="xs">
            <Group><Text size="sm" fw={500}>GPU:</Text><Text size="sm">{endpoint.gpu_spec.count}x {endpoint.gpu_spec.type}</Text></Group>
            <Group><Text size="sm" fw={500}>Replicas:</Text><Text size="sm">{endpoint.replicas}</Text></Group>
            <Group><Text size="sm" fw={500}>Status:</Text><Badge variant="dot" color={endpoint.status === 'active' ? 'green' : 'yellow'}>{endpoint.status}</Badge></Group>
            <Group><Text size="sm" fw={500}>Created:</Text><Text size="sm">{new Date(endpoint.created_at).toLocaleDateString()}</Text></Group>
          </Stack>
        </Paper>
        <AutoscalingPolicy endpoint={endpoint} />
      </SimpleGrid>
    </>
  );
}
```

## Step 6: Verify typecheck and commit

```bash
cd packages/console-ui && pnpm typecheck
git add packages/console-ui/src
git commit -m "feat: add Endpoints page with list, create, detail, metrics, and autoscaling"
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