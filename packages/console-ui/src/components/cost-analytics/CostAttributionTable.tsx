import { useState } from 'react';
import { Paper, Text, Table, Group, Progress, SegmentedControl, Badge } from '@mantine/core';
import { formatCurrency, formatNumber } from '@/utils/format';
import type { CostAnalyticsDimension } from '@/types';

const DIMENSIONS = ['model', 'endpoint', 'api_key', 'team'];
const DIM_LABELS: Record<string, string> = { model: 'Model', endpoint: 'Endpoint', api_key: 'API Key', team: 'Team' };

export function CostAttributionTable({ data }: { data: Record<string, CostAnalyticsDimension[]> }) {
  const [dim, setDim] = useState('model');
  const rows = data[dim] ?? [];

  return (
    <Paper withBorder p="lg" radius="md" mb="md">
      <Group justify="space-between" mb="md">
        <Text size="sm" fw={500}>Cost Attribution — by {DIM_LABELS[dim]}</Text>
        <SegmentedControl size="xs" value={dim} onChange={setDim}
          data={DIMENSIONS.map((d) => ({ label: DIM_LABELS[d], value: d }))} />
      </Group>
      <Table striped highlightOnHover>
        <Table.Thead><Table.Tr>
          <Table.Th>{DIM_LABELS[dim]}</Table.Th><Table.Th>Cost</Table.Th><Table.Th>GPU Hours</Table.Th><Table.Th>Tokens (M)</Table.Th><Table.Th>% of Total</Table.Th>
        </Table.Tr></Table.Thead>
        <Table.Tbody>{rows.map((r) => (
          <Table.Tr key={r.name}>
            <Table.Td><Text size="sm" fw={500}>{r.name}</Text></Table.Td>
            <Table.Td><Text size="sm" fw={500}>{formatCurrency(r.cost_usd)}</Text></Table.Td>
            <Table.Td><Text size="sm">{formatNumber(r.gpu_hours)}h</Text></Table.Td>
            <Table.Td><Text size="sm">{formatNumber(r.tokens_m)}M</Text></Table.Td>
            <Table.Td><Group gap="xs"><Progress value={r.pct} size="sm" w={60} color={r.pct > 40 ? 'red' : r.pct > 20 ? 'yellow' : 'violet'} /><Text size="xs">{r.pct}%</Text></Group></Table.Td>
          </Table.Tr>
        ))}</Table.Tbody>
      </Table>
    </Paper>
  );
}
