import { Table, Badge, Group, ActionIcon, Skeleton, Text } from '@mantine/core';
import { IconPlayerPlay, IconFileText } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useModels } from '@/hooks/useModels';
import { formatCurrency } from '@/utils/format';
import type { Model } from '@/types';

export function ModelsTable({ filters }: { filters: Record<string, string> }) {
  const { data: models, isLoading } = useModels(filters);
  const navigate = useNavigate();

  const rows = (models ?? []).map((m: Model) => (
    <Table.Tr key={m.id}>
      <Table.Td><Text fw={500} size="sm">{m.display_name}</Text><Text size="xs" c="dimmed">{m.id}</Text></Table.Td>
      <Table.Td>{m.author}</Table.Td>
      <Table.Td><Badge variant="light" size="sm">{m.category}</Badge></Table.Td>
      <Table.Td><Text size="sm">{formatCurrency(m.pricing.serverless.input_per_1m_tokens)} / {formatCurrency(m.pricing.serverless.output_per_1m_tokens)}</Text><Text size="xs" c="dimmed">per 1M tokens</Text></Table.Td>
      <Table.Td>{m.pricing.batch_discount_percent && <Badge variant="outline" size="xs" color="green">{m.pricing.batch_discount_percent}% off batch</Badge>}</Table.Td>
      <Table.Td><Badge color={m.status === 'available' ? 'green' : m.status === 'degraded' ? 'yellow' : 'red'} variant="dot" size="sm">{m.status}</Badge></Table.Td>
      <Table.Td><Text size="xs" c="dimmed">—</Text></Table.Td>
      <Table.Td><Text size="xs" c="dimmed">—</Text></Table.Td>
      <Table.Td>
        <Group gap={4}>
          <ActionIcon variant="light" size="sm" onClick={() => navigate(`/playground?model=${m.id}`)} title="Open in Playground"><IconPlayerPlay size={14} /></ActionIcon>
          <ActionIcon variant="light" size="sm" onClick={() => navigate(`/models/${m.id}`)} title="View Details"><IconFileText size={14} /></ActionIcon>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Text size="sm" fw={500} mb="xs">Browse Models</Text>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Model</Table.Th><Table.Th>Author</Table.Th><Table.Th>Category</Table.Th><Table.Th>Serverless Pricing</Table.Th><Table.Th>Batch</Table.Th><Table.Th>Status</Table.Th><Table.Th>Avg Latency</Table.Th><Table.Th>GPU Util</Table.Th><Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {isLoading ? Array.from({ length: 5 }).map((_, i) => <Table.Tr key={i}>{Array.from({ length: 9 }).map((_, j) => <Table.Td key={j}><Skeleton height={20} /></Table.Td>)}</Table.Tr>) : rows}
        </Table.Tbody>
      </Table>
    </>
  );
}
