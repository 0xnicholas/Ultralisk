import { useParams, useNavigate } from 'react-router-dom';
import { Title, Paper, Text, Group, Button, Skeleton, SimpleGrid } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useNode, useClusterNode } from '@/hooks/useNodes';
import { GpuCardGrid } from '@/components/nodes/GpuCardGrid';
import { AreaChart } from '@mantine/charts';

export function NodeDetailPage() {
  const { nodeId, clusterId } = useParams<{ nodeId: string; clusterId?: string }>();
  const navigate = useNavigate();
  // Always call both hooks (React rules-of-hooks); each is `enabled`-gated.
  // Pick whichever query actually fired.
  const nodeScoped = useNode(nodeId ?? '');
  const clusterScoped = useClusterNode(clusterId ?? '', nodeId ?? '');
  const { data: node, isLoading } = clusterId ? clusterScoped : nodeScoped;

  if (isLoading) return <Skeleton height={400} />;
  if (!node) return <Text c="red">Node not found</Text>;

  const avgUtil = node.gpu_cards?.length
    ? Math.round(node.gpu_cards.reduce((s, g) => s + g.utilization_percent, 0) / node.gpu_cards.length)
    : 0;
  const avgTemp = node.gpu_cards?.length
    ? Math.round(node.gpu_cards.reduce((s, g) => s + g.temperature, 0) / node.gpu_cards.length)
    : 0;
  const firstGpu = node.gpu_cards?.[0];
  const chartData =
    firstGpu?.metrics
      ?.slice(0, 20)
      ?.map((m) => ({ time: new Date(m.timestamp).toLocaleTimeString(), Utilization: m.value })) ?? [];

  return (
    <>
      <Group mb="md">
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => (clusterId ? navigate(`/clusters/${clusterId}`) : navigate('/nodes'))}
        >
          Back
        </Button>
      </Group>

      <Group mb="md">
        <div>
          <Title order={2}>{node.hostname}</Title>
          <Group gap="xs">
            <Text c="dimmed" size="sm">
              {node.gpu_model} · {node.gpu_count} GPUs
            </Text>
          </Group>
        </div>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }} mb="md">
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" tt="uppercase">Avg GPU Util</Text>
          <Text fw={700} size="xl">{avgUtil}%</Text>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" tt="uppercase">Avg Temperature</Text>
          <Text fw={700} size="xl">{avgTemp}°C</Text>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" tt="uppercase">Driver / CUDA</Text>
          <Text fw={500} size="sm">{node.driver_version} / {node.cuda_version}</Text>
        </Paper>
      </SimpleGrid>

      {chartData.length > 0 && (
        <Paper withBorder p="lg" radius="md" mb="md">
          <Text size="sm" fw={500} mb="sm">GPU Utilization (last 40 min)</Text>
          <AreaChart
            h={200}
            data={chartData}
            dataKey="time"
            series={[{ name: 'Utilization', color: 'violet.6' }]}
            curveType="natural"
            tickLine="none"
            gridAxis="y"
            withYAxis={false}
          />
        </Paper>
      )}

      <Title order={4} mb="sm">GPU Cards ({node.gpu_cards?.length ?? 0})</Title>
      <GpuCardGrid cards={node.gpu_cards ?? []} />
    </>
  );
}
