# Ultralisk Console Phase 2b — GPU Utilization Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the GPU Utilization dashboard — the core Operations page that provides visibility into GPU fleet health, per-model utilization, per-tenant breakdown, and time-series drill-down.

**Architecture:** Single-page dashboard under Operations sidebar (already exists). Uses @mantine/charts CompositeChart + AreaChart for time-series, stat cards for overview. Stub backend provides mock Prometheus-style time-series data.

**Tech Stack:** React 19.2, TypeScript, Mantine v9, @mantine/charts (CompositeChart, AreaChart), @tanstack/react-query v5

**Reference specs:**
- Design: `docs/superpowers/specs/2026-07-10-ultralisk-console-design.md` (§7.4 GPU Utilization)
- Competitive analysis: `docs/superpowers/specs/2026-07-10-console-competitive-analysis.md` (§2.7 GPU Utilization — Chamber's core page)

---

## File Structure

```
packages/console-ui/src/
├── types/index.ts                       # MODIFY: add GpuUtilization types
├── pages/
│   └── gpu-utilization/
│       └── GpuUtilizationPage.tsx       # CREATE (main dashboard page)
├── components/
│   └── gpu-utilization/
│       ├── OverviewCards.tsx            # CREATE (stat cards)
│       ├── UtilizationChart.tsx         # CREATE (time-series line chart)
│       ├── PerModelBreakdown.tsx        # CREATE (per-model table/chart)
│       └── PerTenantBreakdown.tsx       # CREATE (per-tenant table)
├── api/
│   └── gpuUtilization.ts               # CREATE
├── hooks/
│   └── useGpuUtilization.ts            # CREATE

packages/console-api/src/
├── fixtures.ts                          # MODIFY: add GPU utilization mock data
└── index.ts                             # MODIFY: add /v1/admin/gpu-utilization endpoint
```

---

## Task 1: Stub API — GPU Utilization

- [ ] **Step 1: Append mock data to fixtures.ts**

```typescript
// GPU utilization mock data
const HOURS = Array.from({ length: 72 }, (_, i) => new Date(Date.now() - (71 - i) * 3600000).toISOString());

export const MOCK_GPU_UTILIZATION = {
  overview: {
    total_gpu: 64,
    avg_utilization: 62,
    idle_gpu: 14,
    queued_requests: 3,
  },
  time_series: HOURS.map((timestamp, i) => ({
    timestamp,
    avg_utilization: Math.floor(Math.random() * 40 + 40),
    idle_count: Math.floor(Math.random() * 6 + 2),
    queued_count: Math.floor(Math.random() * 8),
  })),
  per_model: [
    { model_id: 'llama-3.3-70b-instruct', model_display: 'Llama 3.3 70B', gpu_allocated: 24, gpu_utilization: 78, requests_per_sec: 45.2 },
    { model_id: 'llama-3.1-8b-instruct', model_display: 'Llama 3.1 8B', gpu_allocated: 8, gpu_utilization: 92, requests_per_sec: 320.0 },
    { model_id: 'deepseek-v4-pro', model_display: 'DeepSeek V4 Pro', gpu_allocated: 16, gpu_utilization: 55, requests_per_sec: 12.1 },
    { model_id: 'qwen-2.5-72b', model_display: 'Qwen 2.5 72B', gpu_allocated: 8, gpu_utilization: 34, requests_per_sec: 3.4 },
    { model_id: 'llama-3.2-vision-90b', model_display: 'Llama 3.2 Vision 90B', gpu_allocated: 8, gpu_utilization: 41, requests_per_sec: 1.8 },
  ],
  per_tenant: [
    { tenant: 'platform-engineering', gpu_allocated: 32, gpu_utilization: 71, token_usage: 5_200_000, cost_usd: 420.50 },
    { tenant: 'ml-research', gpu_allocated: 16, gpu_utilization: 58, token_usage: 2_800_000, cost_usd: 215.30 },
    { tenant: 'data-science', gpu_allocated: 8, gpu_utilization: 43, token_usage: 890_000, cost_usd: 68.20 },
    { tenant: 'internal-tools', gpu_allocated: 8, gpu_utilization: 29, token_usage: 340_000, cost_usd: 25.80 },
  ],
};
```

- [ ] **Step 2: Add endpoint to index.ts**

Add import:
```typescript
import { ..., MOCK_GPU_UTILIZATION } from './fixtures.js';
```

Add handler before `// === Chat completions`:
```typescript
// === GPU Utilization (Phase 2b) ===
app.get('/v1/admin/gpu-utilization', (_req, res) => {
  res.json({ data: MOCK_GPU_UTILIZATION });
});
```

- [ ] **Step 3: Verify and commit**

```bash
cd packages/console-api && pnpm dev &
sleep 2
curl -s http://localhost:3100/v1/admin/gpu-utilization | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print('Time series points:', len(d['time_series']), '| Models:', len(d['per_model']), '| Tenants:', len(d['per_tenant']))"
kill %1 2>/dev/null
git add packages/console-api/src
git commit -m "feat(api): add GPU utilization mock data and endpoint"
```

---

## Task 2: Types, Route, API, Hook

- [ ] **Step 1: Add types**

Append to `packages/console-ui/src/types/index.ts`:
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

- [ ] **Step 2: Create API and hook**

`packages/console-ui/src/api/gpuUtilization.ts`:
```typescript
import { apiFetch } from './client';
import type { SingleResponse, GpuUtilizationData } from '@/types';

export async function getGpuUtilization() { return apiFetch<SingleResponse<GpuUtilizationData>>('/v1/admin/gpu-utilization'); }
```

`packages/console-ui/src/hooks/useGpuUtilization.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { getGpuUtilization } from '@/api/gpuUtilization';

export function useGpuUtilization() { return useQuery({ queryKey: ['gpu-utilization'], queryFn: () => getGpuUtilization().then((r) => r.data), refetchInterval: 15_000 }); }
```

- [ ] **Step 3: Add route to App.tsx**

Add import:
```typescript
import { GpuUtilizationPage } from '@/pages/gpu-utilization/GpuUtilizationPage';
```

Add route inside ConsoleLayout:
```typescript
<Route path="/gpu-utilization" element={<GpuUtilizationPage />} />
```

Create placeholder page file at `packages/console-ui/src/pages/gpu-utilization/GpuUtilizationPage.tsx` with `export function GpuUtilizationPage() { return null; }`.

The sidebar already has "GPU Utilization" in the Operations section? Let me check — if not, add it to Sidebar.tsx.

- [ ] **Step 4: Commit**

```bash
cd packages/console-ui && pnpm typecheck
git add packages/console-ui/src
git commit -m "feat: add GPU Utilization types, API, hook, and route"
```

---

## Task 3: GPU Utilization Dashboard Page

**Files:**
- Create: `packages/console-ui/src/components/gpu-utilization/OverviewCards.tsx`
- Create: `packages/console-ui/src/components/gpu-utilization/UtilizationChart.tsx`
- Create: `packages/console-ui/src/components/gpu-utilization/PerModelBreakdown.tsx`
- Create: `packages/console-ui/src/components/gpu-utilization/PerTenantBreakdown.tsx`
- Create: `packages/console-ui/src/pages/gpu-utilization/GpuUtilizationPage.tsx`

- [ ] **Step 1: Create OverviewCards**

`packages/console-ui/src/components/gpu-utilization/OverviewCards.tsx`:
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
            <div><Text size="xs" c="dimmed" tt="uppercase" fw={700}>{card.label}</Text><Text fw={700} size="lg">{card.value}</Text></div>
          </Group>
        </Paper>
      ))}
    </SimpleGrid>
  );
}
```

- [ ] **Step 2: Create UtilizationChart**

`packages/console-ui/src/components/gpu-utilization/UtilizationChart.tsx`:
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
      time: new Date(d.timestamp).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }),
      'Avg Utilization': d.avg_utilization,
      'Idle GPUs': d.idle_count,
      'Queued': d.queued_count,
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
          { name: 'Queued', color: 'orange.5' },
        ]}
        curveType="natural" tickLine="none" gridAxis="y" withLegend />
    </Paper>
  );
}
```

- [ ] **Step 3: Create PerModelBreakdown**

`packages/console-ui/src/components/gpu-utilization/PerModelBreakdown.tsx`:
```typescript
import { Paper, Text, Table, Group, Progress, Badge } from '@mantine/core';
import type { GpuUtilizationPerModel } from '@/types';

export function PerModelBreakdown({ data }: { data: GpuUtilizationPerModel[] }) {
  return (
    <Paper withBorder p="lg" radius="md" mb="md">
      <Text size="sm" fw={500} mb="sm">Utilization by Model</Text>
      <Table striped highlightOnHover>
        <Table.Thead><Table.Tr>
          <Table.Th>Model</Table.Th><Table.Th>GPUs Allocated</Table.Th><Table.Th>Utilization</Table.Th><Table.Th>RPS</Table.Th>
        </Table.Tr></Table.Thead>
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

- [ ] **Step 4: Create PerTenantBreakdown**

`packages/console-ui/src/components/gpu-utilization/PerTenantBreakdown.tsx`:
```typescript
import { Paper, Text, Table, Group, Progress, Badge } from '@mantine/core';
import { formatCurrency, formatTokens } from '@/utils/format';
import type { GpuUtilizationPerTenant } from '@/types';

export function PerTenantBreakdown({ data }: { data: GpuUtilizationPerTenant[] }) {
  return (
    <Paper withBorder p="lg" radius="md">
      <Text size="sm" fw={500} mb="sm">Utilization by Team</Text>
      <Table striped highlightOnHover>
        <Table.Thead><Table.Tr>
          <Table.Th>Team</Table.Th><Table.Th>GPUs</Table.Th><Table.Th>Utilization</Table.Th><Table.Th>Token Usage</Table.Th><Table.Th>Cost</Table.Th>
        </Table.Tr></Table.Thead>
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

- [ ] **Step 5: Create the dashboard page**

`packages/console-ui/src/pages/gpu-utilization/GpuUtilizationPage.tsx`:
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

- [ ] **Step 6: Add GPU Utilization to Sidebar (if not already present)**

Read `packages/console-ui/src/components/Sidebar.tsx`. If "GPU Utilization" is not in the Operations section, add it by importing `IconChartArea` and adding an item.

- [ ] **Step 7: Commit**

```bash
cd packages/console-ui && pnpm typecheck
git add packages/console-ui/src
git commit -m "feat: add GPU Utilization dashboard with overview, time-series chart, per-model and per-tenant breakdowns"
```

---

## Summary

**Phase 2b delivers:**

| Component | Description |
|-----------|-------------|
| OverviewCards | 4 stat cards: total GPUs, avg utilization, idle GPUs, queued requests |
| UtilizationChart | Time-series area chart (24h/7d/all) with utilization, idle, queued lines |
| PerModelBreakdown | Table with per-model GPU allocation, utilization bar, RPS |
| PerTenantBreakdown | Table with per-team GPU allocation, utilization, token usage, cost |
| GPU Utilization page | `/gpu-utilization` — full dashboard combining all components |

Single-page delivery. 3 tasks, ~1-2 hours execution.
