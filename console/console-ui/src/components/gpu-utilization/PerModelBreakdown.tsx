import { Paper, Text, Table, Group, Progress, Badge } from '@mantine/core';
import type { GpuUtilizationPerModel } from '@/types';

export function PerModelBreakdown({ data }: { data: GpuUtilizationPerModel[] }) {
  return (
    <Paper withBorder p="lg" radius="md" mb="md">
      <Text size="sm" fw={500} mb="sm">Utilization by Model</Text>
      <Table striped highlightOnHover>
        <Table.Thead><Table.Tr><Table.Th>Model</Table.Th><Table.Th>GPUs</Table.Th><Table.Th>Utilization</Table.Th><Table.Th>RPS</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>{data.map((m) => (
          <Table.Tr key={m.model_id}>
            <Table.Td><Text size="sm" fw={500}>{m.model_display}</Text><Text size="xs" c="dimmed">{m.model_id}</Text></Table.Td>
            <Table.Td><Badge variant="light" size="sm">{m.gpu_allocated}</Badge></Table.Td>
            <Table.Td><Group gap="xs"><Progress value={m.gpu_utilization} size="sm" w={80} color={m.gpu_utilization > 80 ? 'red' : m.gpu_utilization > 50 ? 'yellow' : 'green'} /><Text size="xs">{m.gpu_utilization}%</Text></Group></Table.Td>
            <Table.Td><Text size="sm">{m.requests_per_sec.toFixed(1)}</Text></Table.Td>
          </Table.Tr>
        ))}</Table.Tbody>
      </Table>
    </Paper>
  );
}
