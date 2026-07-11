import { Title, Paper, SimpleGrid, Text, Group, ThemeIcon } from '@mantine/core';
import { IconServer, IconCpu, IconAlertTriangle, IconActivity } from '@tabler/icons-react';
import { ClusterList } from '@/components/clusters/ClusterList';
import { useClusters } from '@/hooks/useClusters';

export function ClustersPage() {
  const { data: clusters } = useClusters();
  const totalGpu = (clusters ?? []).reduce((s, c) => s + c.node_count * (c.gpu_type === 'H100' ? 8 : 4), 0);
  const avgUtil = clusters?.length ? Math.round(clusters.reduce((s, c) => s + c.avg_gpu_util, 0) / clusters.length) : 0;
  const degraded = (clusters ?? []).filter((c) => c.status === 'degraded').length;
  const cards = [
    { label: 'Total Clusters', value: clusters?.length ?? '-', icon: IconServer, color: 'blue' },
    { label: 'Total GPUs', value: totalGpu.toLocaleString(), icon: IconCpu, color: 'violet' },
    { label: 'Avg Utilization', value: `${avgUtil}%`, icon: IconActivity, color: avgUtil > 80 ? 'red' : 'green' },
    { label: 'Degraded', value: degraded, icon: IconAlertTriangle, color: degraded > 0 ? 'yellow' : 'green' },
  ];
  return (
    <>
      <Title order={2} mb="md">Clusters</Title>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="md">
        {cards.map((card) => (
          <Paper key={card.label} withBorder p="md" radius="md">
            <Group><ThemeIcon variant="light" color={card.color} size="lg"><card.icon size={20} /></ThemeIcon>
              <div><Text size="xs" c="dimmed" tt="uppercase" fw={700}>{card.label}</Text><Text fw={700} size="lg">{card.value}</Text></div>
            </Group>
          </Paper>
        ))}
      </SimpleGrid>
      <Paper withBorder p="lg" radius="md"><ClusterList /></Paper>
    </>
  );
}
