# Task for worker

Implement Phase 2c Tasks 1+2+3: Cost Analytics full page

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

Phase 2b is done. Implement Cost Analytics end-to-end.

## TASK 1: Stub API

### Step 1.1: Append to fixtures.ts

Read `packages/console-api/src/fixtures.ts`. Append at the end:

```typescript
// === Cost Analytics (Phase 2c) ===
export const MOCK_COST_DATA = {
  summary: { total_cost_usd: 18420.35, token_cost_usd: 12530.80, gpu_hour_cost_usd: 5889.55, budget_usd: 25000, budget_used_pct: 73.7, estimated_month_end_usd: 27300 },
  by_dimension: {
    model: [
      { name: 'Llama 3.3 70B', cost_usd: 8420.50, gpu_hours: 1250, tokens_m: 14200, pct: 45.7 },
      { name: 'DeepSeek V4 Pro', cost_usd: 5210.30, gpu_hours: 780, tokens_m: 4350, pct: 28.3 },
      { name: 'Qwen 2.5 72B', cost_usd: 2850.75, gpu_hours: 420, tokens_m: 3180, pct: 15.5 },
      { name: 'Llama 3.1 8B', cost_usd: 1410.20, gpu_hours: 180, tokens_m: 28400, pct: 7.7 },
      { name: 'Llama 3.2 Vision 90B', cost_usd: 528.60, gpu_hours: 95, tokens_m: 180, pct: 2.9 },
    ],
    endpoint: [
      { name: 'llama-prod', cost_usd: 6320.00, gpu_hours: 940, tokens_m: 10650, pct: 34.3 },
      { name: 'deepseek-reserved', cost_usd: 5210.30, gpu_hours: 780, tokens_m: 4350, pct: 28.3 },
      { name: 'serverless-default', cost_usd: 4210.50, gpu_hours: 450, tokens_m: 21500, pct: 22.9 },
      { name: 'qwen-dev', cost_usd: 1970.05, gpu_hours: 290, tokens_m: 2230, pct: 10.7 },
      { name: 'batch-processing', cost_usd: 709.50, gpu_hours: 85, tokens_m: 7890, pct: 3.9 },
    ],
    api_key: [
      { name: 'Production', cost_usd: 10230.00, gpu_hours: 1520, tokens_m: 32100, pct: 55.5 },
      { name: 'Development', cost_usd: 5110.20, gpu_hours: 760, tokens_m: 16200, pct: 27.7 },
      { name: 'ML Research', cost_usd: 2850.35, gpu_hours: 420, tokens_m: 4800, pct: 15.5 },
      { name: 'CI/CD', cost_usd: 229.80, gpu_hours: 25, tokens_m: 680, pct: 1.2 },
    ],
    team: [
      { name: 'Platform Engineering', cost_usd: 8210.50, gpu_hours: 1220, tokens_m: 21500, pct: 44.6 },
      { name: 'ML Research', cost_usd: 5620.30, gpu_hours: 840, tokens_m: 8700, pct: 30.5 },
      { name: 'Data Science', cost_usd: 2810.75, gpu_hours: 380, tokens_m: 5400, pct: 15.3 },
      { name: 'Internal Tools', cost_usd: 1778.80, gpu_hours: 185, tokens_m: 4800, pct: 9.7 },
    ],
  },
  daily_cost_trend: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10),
    token_cost: Math.floor(Math.random() * 200 + 300 + i * 5),
    gpu_cost: Math.floor(Math.random() * 100 + 120 + i * 3),
  })),
  budget_alerts: {
    budget_usd: 25000, current_spend: 18420.35, alerts_enabled: true,
    channels: ['email', 'slack'],
    thresholds: [
      { label: '70% warning', type: 'percent', value: 70, triggered: true, triggered_at: '2026-07-08T00:00:00Z' },
      { label: '90% critical', type: 'percent', value: 90, triggered: false },
      { label: 'GPU utilization >85%', type: 'gpu_util', value: 85, triggered: true, triggered_at: '2026-07-09T12:00:00Z' },
    ],
    suppression_window_minutes: 30,
  },
};
```

### Step 1.2: Add endpoint to index.ts

Read `packages/console-api/src/index.ts`. Update imports:
```typescript
import { ..., MOCK_COST_DATA } from './fixtures.js';
```

Add handler BEFORE `// === Chat completions`:
```typescript
// === Cost Analytics (Phase 2c) ===
app.get('/v1/admin/cost-analytics', (_req, res) => {
  res.json({ data: MOCK_COST_DATA });
});
```

### Step 1.3: Commit step
```bash
git add packages/console-api/src && git commit -m "feat(api): add Cost Analytics mock data and endpoint"
```

## TASK 2: Types, API, Hook, Route

### Step 2.1: Add types

Read `packages/console-ui/src/types/index.ts`. Append at end:

```typescript
// === Cost Analytics (Phase 2c) ===
export interface CostAnalyticsDimension {
  name: string; cost_usd: number; gpu_hours: number; tokens_m: number; pct: number;
}

export interface CostAnalyticsSummary {
  total_cost_usd: number; token_cost_usd: number; gpu_hour_cost_usd: number;
  budget_usd: number; budget_used_pct: number; estimated_month_end_usd: number;
}

export interface DailyCostPoint {
  date: string; token_cost: number; gpu_cost: number;
}

export interface BudgetAlertThreshold {
  label: string; type: string; value: number; triggered: boolean; triggered_at?: string;
}

export interface BudgetAlertsConfig {
  budget_usd: number; current_spend: number; alerts_enabled: boolean;
  channels: string[]; thresholds: BudgetAlertThreshold[];
  suppression_window_minutes: number;
}

export interface CostAnalyticsData {
  summary: CostAnalyticsSummary;
  by_dimension: Record<string, CostAnalyticsDimension[]>;
  daily_cost_trend: DailyCostPoint[];
  budget_alerts: BudgetAlertsConfig;
}
```

### Step 2.2: Create API + hook

`packages/console-ui/src/api/costAnalytics.ts`:
```typescript
import { apiFetch } from './client';
import type { SingleResponse, CostAnalyticsData } from '@/types';
export async function getCostAnalytics() { return apiFetch<SingleResponse<CostAnalyticsData>>('/v1/admin/cost-analytics'); }
```

`packages/console-ui/src/hooks/useCostAnalytics.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { getCostAnalytics } from '@/api/costAnalytics';
export function useCostAnalytics() { return useQuery({ queryKey: ['cost-analytics'], queryFn: () => getCostAnalytics().then((r) => r.data), refetchInterval: 30_000 }); }
```

### Step 2.3: Add route and sidebar

Read App.tsx. Add import:
```typescript
import { CostAnalyticsPage } from '@/pages/cost-analytics/CostAnalyticsPage';
```

Add route inside ConsoleLayout:
```typescript
<Route path="/cost-analytics" element={<CostAnalyticsPage />} />
```

Read Sidebar.tsx. Add `IconReportMoney` to imports. Add to Operations section:
```typescript
{ label: 'Cost Analytics', icon: IconReportMoney, path: '/cost-analytics' },
```

Create placeholder at `packages/console-ui/src/pages/cost-analytics/CostAnalyticsPage.tsx`:
```typescript
export function CostAnalyticsPage() { return null; }
```

## TASK 3: Dashboard Page

### Step 3.1: CostSummaryCards

Create `packages/console-ui/src/components/cost-analytics/CostSummaryCards.tsx`:
```typescript
import { SimpleGrid, Paper, Text, Group, ThemeIcon } from '@mantine/core';
import { IconCash, IconCoins, IconCpu, IconChartPie } from '@tabler/icons-react';
import { formatCurrency } from '@/utils/format';
import type { CostAnalyticsSummary } from '@/types';

export function CostSummaryCards({ data }: { data: CostAnalyticsSummary }) {
  const cards = [
    { label: 'Total Cost', value: formatCurrency(data.total_cost_usd), icon: IconCash, color: 'red' },
    { label: 'Token Cost', value: formatCurrency(data.token_cost_usd), icon: IconCoins, color: 'violet' },
    { label: 'GPU Hour Cost', value: formatCurrency(data.gpu_hour_cost_usd), icon: IconCpu, color: 'blue' },
    { label: 'Budget Used', value: `${data.budget_used_pct}%`, sub: `of ${formatCurrency(data.budget_usd)}`, icon: IconChartPie, color: data.budget_used_pct > 80 ? 'red' : 'green' as string },
  ];
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="md">
      {cards.map((card) => (
        <Paper key={card.label} withBorder p="md" radius="md">
          <Group><ThemeIcon variant="light" color={card.color} size="lg"><card.icon size={20} /></ThemeIcon>
            <div><Text size="xs" c="dimmed" tt="uppercase" fw={700}>{card.label}</Text><Text fw={700} size="lg">{card.value}</Text>{card.sub && <Text size="xs" c="dimmed">{card.sub}</Text>}</div>
          </Group>
        </Paper>
      ))}
    </SimpleGrid>
  );
}
```

### Step 3.2: CostAttributionTable

Create `packages/console-ui/src/components/cost-analytics/CostAttributionTable.tsx`:
```typescript
import { useState } from 'react';
import { Paper, Text, Table, Group, Progress, SegmentedControl, Badge } from '@mantine/core';
import { formatCurrency, formatNumber } from '@/utils/format';
import type { CostAnalyticsDimension } from '@/types';

const DIMENSIONS = ['model', 'endpoint', 'api_key', 'team'];
const DIM_LABELS: Record<string, string> = { model: 'Model', endpoint: 'Endpoint', api_key: 'API Key', team: 'Team' };

export function CostAttributionTable({ data }: { data: Record<string, CostAnalyticsDimension[]> }) {
  const [dim, setDim] = useState('model');
  const rows = data[dim] ?? [];

  return (
    <Paper withBorder p="lg" radius="md" mb="md">
      <Group justify="space-between" mb="md">
        <Text size="sm" fw={500}>Cost Attribution — by {DIM_LABELS[dim]}</Text>
        <SegmentedControl size="xs" value={dim} onChange={setDim}
          data={DIMENSIONS.map((d) => ({ label: DIM_LABELS[d], value: d }))} />
      </Group>
      <Table striped highlightOnHover>
        <Table.Thead><Table.Tr>
          <Table.Th>{DIM_LABELS[dim]}</Table.Th><Table.Th>Cost</Table.Th><Table.Th>GPU Hours</Table.Th><Table.Th>Tokens (M)</Table.Th><Table.Th>% of Total</Table.Th>
        </Table.Tr></Table.Thead>
        <Table.Tbody>{rows.map((r) => (
          <Table.Tr key={r.name}>
            <Table.Td><Text size="sm" fw={500}>{r.name}</Text></Table.Td>
            <Table.Td><Text size="sm" fw={500}>{formatCurrency(r.cost_usd)}</Text></Table.Td>
            <Table.Td><Text size="sm">{formatNumber(r.gpu_hours)}h</Text></Table.Td>
            <Table.Td><Text size="sm">{formatNumber(r.tokens_m)}M</Text></Table.Td>
            <Table.Td><Group gap="xs"><Progress value={r.pct} size="sm" w={60} color={r.pct > 40 ? 'red' : r.pct > 20 ? 'yellow' : 'violet'} /><Text size="xs">{r.pct}%</Text></Group></Table.Td>
          </Table.Tr>
        ))}</Table.Tbody>
      </Table>
    </Paper>
  );
}
```

### Step 3.3: GpuHourCostChart

Create `packages/console-ui/src/components/cost-analytics/GpuHourCostChart.tsx`:
```typescript
import { Paper, Text } from '@mantine/core';
import { CompositeChart } from '@mantine/charts';
import type { DailyCostPoint } from '@/types';

export function GpuHourCostChart({ data }: { data: DailyCostPoint[] }) {
  return (
    <Paper withBorder p="lg" radius="md" mb="md">
      <Text size="sm" fw={500} mb="md">Daily Cost Trend — Token Cost vs GPU Hour Cost</Text>
      <CompositeChart h={280} data={data} dataKey="date"
        series={[
          { name: 'token_cost', label: 'Token Cost', color: 'violet.6', type: 'bar' },
          { name: 'gpu_cost', label: 'GPU Cost', color: 'blue.6', type: 'bar' },
        ]}
        tickLine="none" gridAxis="y" withLegend legendProps={{ verticalAlign: 'bottom' }} />
    </Paper>
  );
}
```

### Step 3.4: BudgetAlertsConfig

Create `packages/console-ui/src/components/cost-analytics/BudgetAlertsConfig.tsx`:
```typescript
import { Paper, Text, Group, Badge, RingProgress, Stack, Table, Switch } from '@mantine/core';
import { formatCurrency, formatRelativeTime } from '@/utils/format';
import type { BudgetAlertsConfig as BudgetConfig } from '@/types';

export function BudgetAlertsConfig({ data }: { data: BudgetConfig }) {
  return (
    <Paper withBorder p="lg" radius="md">
      <Group justify="space-between" mb="md">
        <Text size="sm" fw={500}>Budget & Alerts</Text>
        <Switch checked={data.alerts_enabled} label="Alerts enabled" />
      </Group>
      <Group gap="xl" mb="md">
        <RingProgress size={120} thickness={10}
          sections={[{ value: data.current_spend / data.budget_usd * 100, color: (data.current_spend / data.budget_usd) > 0.9 ? 'red' : (data.current_spend / data.budget_usd) > 0.7 ? 'yellow' : 'green' }]}
          label={<Text size="xs" ta="center" fw={700}>{((data.current_spend / data.budget_usd) * 100).toFixed(0)}%</Text>} />
        <Stack gap={4}>
          <Text size="sm">{formatCurrency(data.current_spend)} / {formatCurrency(data.budget_usd)}</Text>
          <Group gap={4}>{data.channels.map((c) => <Badge key={c} variant="light" size="sm">{c === 'email' ? '📧' : '💬'} {c}</Badge>)}</Group>
          <Text size="xs" c="dimmed">Suppression: {data.suppression_window_minutes}min</Text>
        </Stack>
      </Group>
      <Table striped highlightOnHover>
        <Table.Thead><Table.Tr><Table.Th>Threshold</Table.Th><Table.Th>Type</Table.Th><Table.Th>Value</Table.Th><Table.Th>Status</Table.Th><Table.Th>Triggered</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>{data.thresholds.map((t) => (
          <Table.Tr key={t.label}>
            <Table.Td><Text size="sm">{t.label}</Text></Table.Td>
            <Table.Td><Badge variant="light" size="xs">{t.type}</Badge></Table.Td>
            <Table.Td><Text size="sm">{t.type === 'percent' ? `${t.value}%` : `>${t.value}%`}</Text></Table.Td>
            <Table.Td><Badge variant="dot" size="sm" color={t.triggered ? 'yellow' : 'green'}>{t.triggered ? 'Firing' : 'OK'}</Badge></Table.Td>
            <Table.Td><Text size="xs" c="dimmed">{t.triggered_at ? formatRelativeTime(t.triggered_at) : '-'}</Text></Table.Td>
          </Table.Tr>
        ))}</Table.Tbody>
      </Table>
    </Paper>
  );
}
```

### Step 3.5: Create CostAnalyticsPage (overwrite placeholder)

Write `packages/console-ui/src/pages/cost-analytics/CostAnalyticsPage.tsx`:
```typescript
import { Title, Skeleton } from '@mantine/core';
import { useCostAnalytics } from '@/hooks/useCostAnalytics';
import { CostSummaryCards } from '@/components/cost-analytics/CostSummaryCards';
import { CostAttributionTable } from '@/components/cost-analytics/CostAttributionTable';
import { GpuHourCostChart } from '@/components/cost-analytics/GpuHourCostChart';
import { BudgetAlertsConfig } from '@/components/cost-analytics/BudgetAlertsConfig';

export function CostAnalyticsPage() {
  const { data, isLoading } = useCostAnalytics();
  if (isLoading) return <Skeleton height={500} />;
  if (!data) return null;
  return (
    <>
      <Title order={2} mb="md">Cost Analytics</Title>
      <CostSummaryCards data={data.summary} />
      <GpuHourCostChart data={data.daily_cost_trend} />
      <CostAttributionTable data={data.by_dimension} />
      <BudgetAlertsConfig data={data.budget_alerts} />
    </>
  );
}
```

### Step 3.6: Verify and commit

```bash
cd packages/console-ui && pnpm typecheck
git add packages/console-api/src packages/console-ui/src
git commit -m "feat: add Cost Analytics page with attribution, GPU-hour cost chart, and budget alerts"
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