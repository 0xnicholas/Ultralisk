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
