import { SimpleGrid, Paper, Text, Group, Progress, Badge } from '@mantine/core';
import type { GpuCard } from '@/types';

export function GpuCardGrid({ cards }: { cards: GpuCard[] }) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="md">
      {cards.map((gpu) => {
        const memPct = Math.round((gpu.memory_used / gpu.memory_total) * 100);
        return (
          <Paper key={gpu.id} withBorder p="md" radius="md">
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={600}>GPU {gpu.index}</Text>
              <Badge size="xs" color={gpu.processes.length > 0 ? 'green' : 'gray'} variant="light">
                {gpu.processes.length} procs
              </Badge>
            </Group>

            <Group mb={4}>
              <Text size="xs" c="dimmed">Util</Text>
              <Text size="xs" fw={500}>{gpu.utilization_percent}%</Text>
            </Group>
            <Progress
              value={gpu.utilization_percent}
              size="sm"
              color={gpu.utilization_percent > 80 ? 'red' : gpu.utilization_percent > 50 ? 'yellow' : 'green'}
              mb="xs"
            />

            <Group mb={4}>
              <Text size="xs" c="dimmed">Memory</Text>
              <Text size="xs" fw={500}>{gpu.memory_used}/{gpu.memory_total} GB</Text>
            </Group>
            <Progress value={memPct} size="sm" color={memPct > 80 ? 'red' : 'blue'} mb="xs" />

            <Group>
              <Text size="xs" c="dimmed">Temp</Text>
              <Text
                size="xs"
                fw={500}
                c={gpu.temperature > 80 ? 'red' : gpu.temperature > 70 ? 'yellow' : 'green'}
              >
                {gpu.temperature}°C
              </Text>
            </Group>

            {gpu.processes.length > 0 && (
              <Paper p="xs" mt="xs" style={{ borderRadius: 4, backgroundColor: 'var(--mantine-color-dark-8)' }}>
                <Text size="xs" c="dimmed">Processes:</Text>
                {gpu.processes.map((p) => (
                  <Text key={p.pid} size="xs" ff="mono">{p.name} ({p.memory_mb}MB)</Text>
                ))}
              </Paper>
            )}
          </Paper>
        );
      })}
    </SimpleGrid>
  );
}
