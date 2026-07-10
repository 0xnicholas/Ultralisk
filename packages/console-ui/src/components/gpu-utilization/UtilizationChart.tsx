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
