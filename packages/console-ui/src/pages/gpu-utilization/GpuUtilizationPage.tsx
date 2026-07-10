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
