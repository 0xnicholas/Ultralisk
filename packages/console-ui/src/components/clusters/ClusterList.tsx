import { Table, Badge, Text, Group, ActionIcon, Skeleton, Tooltip, Progress } from '@mantine/core';
import { IconEye } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useClusters } from '@/hooks/useClusters';
import type { Cluster } from '@/types';

export function ClusterList() {
  const { data: clusters, isLoading } = useClusters();
  const navigate = useNavigate();
  const rows = (clusters ?? []).map((c: Cluster) => (
    <Table.Tr key={c.id}>
      <Table.Td><Text size="sm" fw={500}>{c.name}</Text><Text size="xs" c="dimmed">{c.region}</Text></Table.Td>
      <Table.Td><Badge variant="light" size="sm">{c.gpu_type}</Badge></Table.Td>
      <Table.Td><Text size="sm">{c.healthy_nodes}/{c.node_count}</Text></Table.Td>
      <Table.Td><Group gap="xs"><Progress value={c.avg_gpu_util} size="sm" w={80} color={c.avg_gpu_util > 80 ? 'red' : c.avg_gpu_util > 60 ? 'yellow' : 'green'} /><Text size="xs">{c.avg_gpu_util}%</Text></Group></Table.Td>
      <Table.Td><Badge variant="dot" size="sm" color={c.status === 'healthy' ? 'green' : 'yellow'}>{c.status}</Badge></Table.Td>
      <Table.Td><Tooltip label="View cluster"><ActionIcon variant="light" size="sm" onClick={() => navigate(`/clusters/${c.id}`)}><IconEye size={14} /></ActionIcon></Tooltip></Table.Td>
    </Table.Tr>
  ));
  return (
    <Table striped highlightOnHover>
      <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>GPU</Table.Th><Table.Th>Nodes</Table.Th><Table.Th>Avg GPU Util</Table.Th><Table.Th>Status</Table.Th><Table.Th></Table.Th></Table.Tr></Table.Thead>
      <Table.Tbody>{isLoading ? [1,2,3].map((i) => <Table.Tr key={i}>{[1,2,3,4,5,6].map((j) => <Table.Td key={j}><Skeleton height={20} /></Table.Td>)}</Table.Tr>) : rows}</Table.Tbody>
    </Table>
  );
}
