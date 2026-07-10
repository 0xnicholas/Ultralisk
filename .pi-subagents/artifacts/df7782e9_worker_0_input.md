# Task for worker

Implement Phase 2b Tasks 2+3 together: Types/Route/API/Hook + Dashboard Page

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

Task 1 (stub API) is done.

## TASK 2: Types, Route, API, Hook

### Step 2.1: Add GPU Utilization types

Read `packages/console-ui/src/types/index.ts`. Append at the end:

```typescript
// === GPU Utilization (Phase 2b) ===
export interface GpuUtilizationOverview {
  total_gpu: number; avg_utilization: number; idle_gpu: number; queued_requests: number;
}

export interface GpuUtilizationTimePoint {
  timestamp: string; avg_utilization: number; idle_count: number; queued_count: number;
}

export interface GpuUtilizationPerModel {
  model_id: string; model_display: string; gpu_allocated: number; gpu_utilization: number; requests_per_sec: number;
}

export interface GpuUtilizationPerTenant {
  tenant: string; gpu_allocated: number; gpu_utilization: number; token_usage: number; cost_usd: number;
}

export interface GpuUtilizationData {
  overview: GpuUtilizationOverview;
  time_series: GpuUtilizationTimePoint[];
  per_model: GpuUtilizationPerModel[];
  per_tenant: GpuUtilizationPerTenant[];
}
```

### Step 2.2: Create API and hook

Create `packages/console-ui/src/api/gpuUtilization.ts`:
```typescript
import { apiFetch } from './client';
import type { SingleResponse, GpuUtilizationData } from '@/types';

export async function getGpuUtilization() { return apiFetch<SingleResponse<GpuUtilizationData>>('/v1/admin/gpu-utilization'); }
```

Create `packages/console-ui/src/hooks/useGpuUtilization.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { getGpuUtilization } from '@/api/gpuUtilization';

export function useGpuUtilization() { return useQuery({ queryKey: ['gpu-utilization'], queryFn: () => getGpuUtilization().then((r) => r.data), refetchInterval: 15_000 }); }
```

### Step 2.3: Add route to App.tsx and sidebar

Read `packages/console-ui/src/App.tsx`. Add import:
```typescript
import { GpuUtilizationPage } from '@/pages/gpu-utilization/GpuUtilizationPage';
```

Add route inside ConsoleLayout:
```typescript
<Route path="/gpu-utilization" element={<GpuUtilizationPage />} />
```

Read `packages/console-ui/src/components/Sidebar.tsx`. If "GPU Utilization" is not in the Operations section, add it. Add `IconChartArea` to imports and add an item:
```typescript
{ label: 'GPU Utilization', icon: IconChartArea, path: '/gpu-utilization' },
```

Create placeholder page at `packages/console-ui/src/pages/gpu-utilization/GpuUtilizationPage.tsx`:
```typescript
export function GpuUtilizationPage() { return null; }
```

## TASK 3: GPU Utilization Dashboard

### Step 3.1: Create OverviewCards

Create `packages/console-ui/src/components/gpu-utilization/OverviewCards.tsx`:
```typescript
import { SimpleGrid, Paper, Text, Group, ThemeIcon } from '@mantine/core';
import { IconServer, IconActivity, IconCpu, IconClock } from '@tabler/icons-react';
import type { GpuUtilizationOverview } from '@/types';

export function OverviewCards({ data }: { data: GpuUtilizationOverview }) {
  const cards = [
    { label: 'Total GPUs', value: data.total_gpu, icon: IconServer, color: 'blue' },
    { label: 'Avg Utilization', value: `${data.avg_utilization}%`, icon: IconActivity, color: data.avg_utilization > 80 ? 'red' : data.avg_utilization > 50 ? 'yellow' : 'green' as string },
    { label: 'Idle GPUs', value: data.idle_gpu, icon: IconCpu, color: data.idle_gpu > 10 ? 'green' : 'yellow' as string },
    { label: 'Queued Requests', value: data.queued_requests, icon: IconClock, color: data.queued_requests > 10 ? 'red' : 'blue' as string },
  ];
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="md">
      {cards.map((card) => (
        <Paper key={card.label} withBorder p="md" radius="md">
          <Group><ThemeIcon variant="light" color={card.color} size="lg"><card.icon size={20} /></ThemeIcon>
            <div><Text size="xs" c="dimmed" tt="uppercase" fw={700}>{card.label}</Text><Text fw={700} size="lg">{String(card.value)}</Text></div>
          </Group>
        </Paper>
      ))}
    </SimpleGrid>
  );
}
```

### Step 3.2: Create UtilizationChart

Create `packages/console-ui/src/components/gpu-utilization/UtilizationChart.tsx`:
```typescript
import { Paper, Text, SegmentedControl, Group } from '@mantine/core';
import { AreaChart } from '@mantine/charts';
import { useState, useMemo } from 'react';
import type { GpuUtilizationTimePoint } from '@/types';

export function UtilizationChart({ data }: { data: GpuUtilizationTimePoint[] }) {
  const [range, setRange] = useState('24h');
  const filtered = useMemo(() => {
    const points = range === '24h' ? 24 : range === '7d' ? 72 : data.length;
    return data.slice(-points).map((d) => ({
      time: new Date(d.timestamp).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' }),
      'Avg Utilization': d.avg_utilization,
      'Idle GPUs': d.idle_count,
      Queued: d.queued_count,
    }));
  }, [data, range]);

  return (
    <Paper withBorder p="lg" radius="md" mb="md">
      <Group justify="space-between" mb="md">
        <Text size="sm" fw={500}>GPU Utilization Over Time</Text>
        <SegmentedControl size="xs" value={range} onChange={setRange}
          data={[{ label: '24h', value: '24h' }, { label: '7d', value: '7d' }, { label: 'All', value: 'all' }]} />
      </Group>
      <AreaChart h={280} data={filtered} dataKey="time"
        series={[
          { name: 'Avg Utilization', color: 'violet.6' },
          { name: 'Idle GPUs', color: 'blue.6' },
          { name: 'Queued', color: 'orange.6' },
        ]}
        curveType="natural" tickLine="none" gridAxis="y" withLegend />
    </Paper>
  );
}
```

### Step 3.3: Create PerModelBreakdown

Create `packages/console-ui/src/components/gpu-utilization/PerModelBreakdown.tsx`:
```typescript
import { Paper, Text, Table, Group, Progress, Badge } from '@mantine/core';
import type { GpuUtilizationPerModel } from '@/types';

export function PerModelBreakdown({ data }: { data: GpuUtilizationPerModel[] }) {
  return (
    <Paper withBorder p="lg" radius="md" mb="md">
      <Text size="sm" fw={500} mb="sm">Utilization by Model</Text>
      <Table striped highlightOnHover>
        <Table.Thead><Table.Tr><Table.Th>Model</Table.Th><Table.Th>GPUs</Table.Th><Table.Th>Utilization</Table.Th><Table.Th>RPS</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>{data.map((m) => (
          <Table.Tr key={m.model_id}>
            <Table.Td><Text size="sm" fw={500}>{m.model_display}</Text><Text size="xs" c="dimmed">{m.model_id}</Text></Table.Td>
            <Table.Td><Badge variant="light" size="sm">{m.gpu_allocated}</Badge></Table.Td>
            <Table.Td><Group gap="xs"><Progress value={m.gpu_utilization} size="sm" w={80} color={m.gpu_utilization > 80 ? 'red' : m.gpu_utilization > 50 ? 'yellow' : 'green'} /><Text size="xs">{m.gpu_utilization}%</Text></Group></Table.Td>
            <Table.Td><Text size="sm">{m.requests_per_sec.toFixed(1)}</Text></Table.Td>
          </Table.Tr>
        ))}</Table.Tbody>
      </Table>
    </Paper>
  );
}
```

### Step 3.4: Create PerTenantBreakdown

Create `packages/console-ui/src/components/gpu-utilization/PerTenantBreakdown.tsx`:
```typescript
import { Paper, Text, Table, Group, Progress, Badge } from '@mantine/core';
import { formatCurrency, formatTokens } from '@/utils/format';
import type { GpuUtilizationPerTenant } from '@/types';

export function PerTenantBreakdown({ data }: { data: GpuUtilizationPerTenant[] }) {
  return (
    <Paper withBorder p="lg" radius="md">
      <Text size="sm" fw={500} mb="sm">Utilization by Team</Text>
      <Table striped highlightOnHover>
        <Table.Thead><Table.Tr><Table.Th>Team</Table.Th><Table.Th>GPUs</Table.Th><Table.Th>Utilization</Table.Th><Table.Th>Tokens</Table.Th><Table.Th>Cost</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>{data.map((t) => (
          <Table.Tr key={t.tenant}>
            <Table.Td><Text size="sm" fw={500}>{t.tenant}</Text></Table.Td>
            <Table.Td><Badge variant="light" size="sm">{t.gpu_allocated}</Badge></Table.Td>
            <Table.Td><Group gap="xs"><Progress value={t.gpu_utilization} size="sm" w={60} color={t.gpu_utilization > 80 ? 'red' : t.gpu_utilization > 50 ? 'yellow' : 'green'} /><Text size="xs">{t.gpu_utilization}%</Text></Group></Table.Td>
            <Table.Td><Text size="sm">{formatTokens(t.token_usage)}</Text></Table.Td>
            <Table.Td><Text size="sm">{formatCurrency(t.cost_usd)}</Text></Table.Td>
          </Table.Tr>
        ))}</Table.Tbody>
      </Table>
    </Paper>
  );
}
```

### Step 3.5: Create the dashboard page (overwrite placeholder)

Write `packages/console-ui/src/pages/gpu-utilization/GpuUtilizationPage.tsx`:
```typescript
import { Title, Skeleton } from '@mantine/core';
import { useGpuUtilization } from '@/hooks/useGpuUtilization';
import { OverviewCards } from '@/components/gpu-utilization/OverviewCards';
import { UtilizationChart } from '@/components/gpu-utilization/UtilizationChart';
import { PerModelBreakdown } from '@/components/gpu-utilization/PerModelBreakdown';
import { PerTenantBreakdown } from '@/components/gpu-utilization/PerTenantBreakdown';

export function GpuUtilizationPage() {
  const { data, isLoading } = useGpuUtilization();
  if (isLoading) return <Skeleton height={500} />;
  if (!data) return null;
  return (
    <>
      <Title order={2} mb="md">GPU Utilization</Title>
      <OverviewCards data={data.overview} />
      <UtilizationChart data={data.time_series} />
      <PerModelBreakdown data={data.per_model} />
      <PerTenantBreakdown data={data.per_tenant} />
    </>
  );
}
```

### Step 3.6: Verify and commit

```bash
cd packages/console-ui && pnpm typecheck
# Fix any errors
git add packages/console-ui/src
git commit -m "feat: add GPU Utilization dashboard with overview, time-series chart, per-model and per-tenant breakdowns"
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