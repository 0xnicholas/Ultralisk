import { Table, Badge, Text, Group, ActionIcon, Skeleton, Tooltip } from '@mantine/core';
import { IconEye } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useDeployments } from '@/hooks/useDeployments';
import type { Deployment } from '@/types';

export function DeploymentList() {
  const { data: deployments, isLoading } = useDeployments();
  const navigate = useNavigate();
  const rows = (deployments ?? []).map((d: Deployment) => (
    <Table.Tr key={d.id}>
      <Table.Td><Text size="sm" fw={500}>{d.name}</Text><Text size="xs" c="dimmed">{d.model_id}</Text></Table.Td>
      <Table.Td><Text size="sm">{d.replicas}</Text></Table.Td>
      <Table.Td><Text size="sm">{d.gpu_per_replica} GPU</Text></Table.Td>
      <Table.Td><Badge variant="light" size="sm">{d.cluster_id}</Badge></Table.Td>
      <Table.Td><Badge variant="dot" size="sm" color={d.status === 'active' ? 'green' : d.status === 'degraded' ? 'yellow' : 'blue'}>{d.status}</Badge></Table.Td>
      <Table.Td><Group gap={4}><Tooltip label="View details"><ActionIcon variant="light" size="sm" onClick={() => navigate(`/deployments/${d.id}`)}><IconEye size={14} /></ActionIcon></Tooltip></Group></Table.Td>
    </Table.Tr>
  ));
  return (
    <Table striped highlightOnHover>
      <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Replicas</Table.Th><Table.Th>GPU/Rep</Table.Th><Table.Th>Cluster</Table.Th><Table.Th>Status</Table.Th><Table.Th></Table.Th></Table.Tr></Table.Thead>
      <Table.Tbody>{isLoading ? [1,2,3].map((i) => <Table.Tr key={i}>{[1,2,3,4,5,6].map((j) => <Table.Td key={j}><Skeleton height={20} /></Table.Td>)}</Table.Tr>) : rows}</Table.Tbody>
    </Table>
  );
}
