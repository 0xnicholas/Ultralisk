import { Paper, SimpleGrid, Text } from '@mantine/core';
import type { Endpoint } from '@/types';

export function EndpointMetrics({ endpoint }: { endpoint: Endpoint }) {
  const metrics = [
    { label: 'QPS', value: endpoint.metrics.qps.toFixed(1), color: 'blue' },
    { label: 'TTFT p95', value: `${endpoint.metrics.ttft_p95_ms}ms`, color: 'violet' },
    { label: 'TPOT', value: `${endpoint.metrics.tpot_ms}ms`, color: 'green' },
    { label: 'Error Rate', value: `${endpoint.metrics.error_rate}%`, color: endpoint.metrics.error_rate > 1 ? 'red' : 'green' as string },
    { label: 'GPU Util', value: `${endpoint.metrics.gpu_util}%`, color: 'orange' },
  ];
  return (
    <SimpleGrid cols={5} mb="md">
      {metrics.map((m) => (
        <Paper key={m.label} withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{m.label}</Text>
          <Text size="lg" fw={700} c={m.color}>{m.value}</Text>
        </Paper>
      ))}
    </SimpleGrid>
  );
}
