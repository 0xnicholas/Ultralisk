import { Table, Badge, Text, Group, ActionIcon, Skeleton, Tooltip } from '@mantine/core';
import { IconEye, IconTrash } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useEndpoints, useDeleteEndpoint } from '@/hooks/useEndpoints';
import type { Endpoint } from '@/types';

export function EndpointList() {
  const { data: endpoints, isLoading } = useEndpoints();
  const deleteMutation = useDeleteEndpoint();
  const navigate = useNavigate();

  const rows = (endpoints ?? []).map((ep: Endpoint) => (
    <Table.Tr key={ep.id}>
      <Table.Td><Text size="sm" fw={500}>{ep.name}</Text><Text size="xs" c="dimmed">{ep.model_id}</Text></Table.Td>
      <Table.Td><Badge variant="light" size="sm" color={ep.type === 'dedicated' ? 'violet' : 'blue'}>{ep.type}</Badge></Table.Td>
      <Table.Td><Text size="sm">{ep.replicas}x {ep.gpu_spec.type}</Text></Table.Td>
      <Table.Td><Text size="sm">{ep.metrics.qps} QPS</Text></Table.Td>
      <Table.Td><Badge variant="dot" size="sm" color={ep.status === 'active' ? 'green' : ep.status === 'degraded' ? 'yellow' : 'red'}>{ep.status}</Badge></Table.Td>
      <Table.Td>
        <Group gap={4}>
          <Tooltip label="View details"><ActionIcon variant="light" size="sm" onClick={() => navigate(`/endpoints/${ep.id}`)}><IconEye size={14} /></ActionIcon></Tooltip>
          <Tooltip label="Delete"><ActionIcon variant="light" color="red" size="sm" onClick={() => deleteMutation.mutate(ep.id)} loading={deleteMutation.isPending}><IconTrash size={14} /></ActionIcon></Tooltip>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Table striped highlightOnHover>
      <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Type</Table.Th><Table.Th>GPU</Table.Th><Table.Th>Throughput</Table.Th><Table.Th>Status</Table.Th><Table.Th></Table.Th></Table.Tr></Table.Thead>
      <Table.Tbody>{isLoading ? [1,2,3].map((i) => <Table.Tr key={i}>{[1,2,3,4,5,6].map((j) => <Table.Td key={j}><Skeleton height={20} /></Table.Td>)}</Table.Tr>) : rows}</Table.Tbody>
    </Table>
  );
}
