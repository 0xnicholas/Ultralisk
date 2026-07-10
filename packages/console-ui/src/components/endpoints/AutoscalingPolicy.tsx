import { Paper, Text, Group, Badge } from '@mantine/core';
import type { Endpoint } from '@/types';

export function AutoscalingPolicy({ endpoint }: { endpoint: Endpoint }) {
  if (!endpoint.autoscaling_policy) {
    return <Paper withBorder p="md" radius="md"><Text size="sm" c="dimmed">Autoscaling not configured</Text></Paper>;
  }
  const { min_replicas, max_replicas, target_cpu_util } = endpoint.autoscaling_policy;
  return (
    <Paper withBorder p="md" radius="md">
      <Text size="sm" fw={500} mb="xs">Autoscaling Policy</Text>
      <Group gap="md">
        <div><Text size="xs" c="dimmed">Min Replicas</Text><Text fw={600}>{min_replicas}</Text></div>
        <div><Text size="xs" c="dimmed">Max Replicas</Text><Text fw={600}>{max_replicas}</Text></div>
        <div><Text size="xs" c="dimmed">Target CPU</Text><Badge color="violet" variant="light">{target_cpu_util}%</Badge></div>
      </Group>
    </Paper>
  );
}
