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
