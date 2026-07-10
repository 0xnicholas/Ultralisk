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
