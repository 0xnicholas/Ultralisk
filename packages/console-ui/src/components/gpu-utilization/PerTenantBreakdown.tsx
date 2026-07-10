import { Paper, Text, Table, Group, Progress, Badge } from '@mantine/core';
import { formatCurrency, formatTokens } from '@/utils/format';
import type { GpuUtilizationPerTenant } from '@/types';

export function PerTenantBreakdown({ data }: { data: GpuUtilizationPerTenant[] }) {
  return (
    <Paper withBorder p="lg" radius="md">
      <Text size="sm" fw={500} mb="sm">Utilization by Team</Text>
      <Table striped highlightOnHover>
        <Table.Thead><Table.Tr><Table.Th>Team</Table.Th><Table.Th>GPUs</Table.Th><Table.Th>Utilization</Table.Th><Table.Th>Tokens</Table.Th><Table.Th>Cost</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>{data.map((t) => (
          <Table.Tr key={t.tenant}>
            <Table.Td><Text size="sm" fw={500}>{t.tenant}</Text></Table.Td>
            <Table.Td><Badge variant="light" size="sm">{t.gpu_allocated}</Badge></Table.Td>
            <Table.Td><Group gap="xs"><Progress value={t.gpu_utilization} size="sm" w={60} color={t.gpu_utilization > 80 ? 'red' : t.gpu_utilization > 50 ? 'yellow' : 'green'} /><Text size="xs">{t.gpu_utilization}%</Text></Group></Table.Td>
            <Table.Td><Text size="sm">{formatTokens(t.token_usage)}</Text></Table.Td>
            <Table.Td><Text size="sm">{formatCurrency(t.cost_usd)}</Text></Table.Td>
          </Table.Tr>
        ))}</Table.Tbody>
      </Table>
    </Paper>
  );
}
