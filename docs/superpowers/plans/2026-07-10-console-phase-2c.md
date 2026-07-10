# Ultralisk Console Phase 2c — Cost Analytics

**Goal:** Build the Cost Analytics page — 5-dimension cost attribution, token↔GPU-hour cost correlation, and budget alerts.

**Architecture:** Single Operations page. Dimension switcher controls which breakdown to display. CompositeChart for cost trends. Budget alerts section with configurable thresholds.

**Tech Stack:** React 19.2, Mantine v9, @mantine/charts (BarChart, CompositeChart), @tanstack/react-query

**Reference specs:** Design §7.5, Competitive analysis §2.8

---

## File Structure

```
packages/console-ui/src/
├── types/index.ts                           # MODIFY: add CostAnalytics types
├── pages/cost-analytics/
│   └── CostAnalyticsPage.tsx                # CREATE
├── components/cost-analytics/
│   ├── CostSummaryCards.tsx                 # CREATE (total cost, GPU cost, token cost, budget remaining)
│   ├── CostAttributionTable.tsx             # CREATE (5-dimension table with dimension switcher)
│   ├── GpuHourCostChart.tsx                 # CREATE (token cost vs GPU time cost composite chart)
│   └── BudgetAlertsConfig.tsx               # CREATE (budget setting, alert thresholds, suppression)
├── api/costAnalytics.ts                     # CREATE
├── hooks/useCostAnalytics.ts                # CREATE

packages/console-api/src/
├── fixtures.ts                              # MODIFY: add cost analytics mock data
└── index.ts                                 # MODIFY: add /v1/admin/cost-analytics endpoint
```

---

## Task 1: Stub API — Cost Analytics

- [ ] Append to `fixtures.ts`:

```typescript
export const MOCK_COST_DATA = {
  summary: {
    total_cost_usd: 18420.35,
    token_cost_usd: 12530.80,
    gpu_hour_cost_usd: 5889.55,
    budget_usd: 25000,
    budget_used_pct: 73.7,
    estimated_month_end_usd: 27300,
  },
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
    budget_usd: 25000,
    current_spend: 18420.35,
    alerts_enabled: true,
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

- [ ] Add endpoint to `index.ts`:

```typescript
// import
import { ..., MOCK_COST_DATA } from './fixtures.js';

// handler
app.get('/v1/admin/cost-analytics', (_req, res) => {
  res.json({ data: MOCK_COST_DATA });
});
```

- [ ] Commit

---

## Task 2: Types, API, Hook, Route

- [ ] Add types to `types/index.ts`:

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

- [ ] Create `api/costAnalytics.ts`:

```typescript
import { apiFetch } from './client';
import type { SingleResponse, CostAnalyticsData } from '@/types';
export async function getCostAnalytics() { return apiFetch<SingleResponse<CostAnalyticsData>>('/v1/admin/cost-analytics'); }
```

- [ ] Create `hooks/useCostAnalytics.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { getCostAnalytics } from '@/api/costAnalytics';
export function useCostAnalytics() { return useQuery({ queryKey: ['cost-analytics'], queryFn: () => getCostAnalytics().then((r) => r.data), refetchInterval: 30_000 }); }
```

- [ ] Add route to App.tsx and sidebar item

- [ ] Commit

---

## Task 3: Cost Analytics Dashboard Page

- [ ] **CostSummaryCards**: 4 stat cards (Total Cost, Token Cost, GPU Hours Cost, Budget Used %)

- [ ] **CostAttributionTable**: Table with dimension switcher (SegmentedControl: Model / Endpoint / API Key / Team / Project). Shows name, cost, GPU hours, tokens millions, and % of total with progress bar.

- [ ] **GpuHourCostChart**: CompositeChart showing daily token_cost + gpu_cost stacked bars, demonstrating the token↔GPU cost correlation (the exclusive differentiator).

- [ ] **BudgetAlertsConfig**: Budget ring progress, alert channels (email/slack badges), threshold table with triggered status, suppression window config.

- [ ] **CostAnalyticsPage**: Combine all components.

- [ ] Commit, build, verify.

---

## Summary

Single dashboard page with 4 component blocks:

| Component | Content |
|-----------|---------|
| CostSummaryCards | Total / Token / GPU-hour / Budget % |
| CostAttributionTable | 5-dimension breakdown with switcher |
| GpuHourCostChart | 30-day token vs GPU cost composite chart |
| BudgetAlertsConfig | Budget ring, alerts, thresholds, suppression |
