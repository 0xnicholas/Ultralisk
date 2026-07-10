import { useParams, useNavigate } from 'react-router-dom';
import { Title, Paper, Text, Group, Button, Skeleton, SimpleGrid, Progress, Table, Badge } from '@mantine/core';
import { IconArrowLeft, IconCpu } from '@tabler/icons-react';
import { useCluster } from '@/hooks/useClusters';

export function ClusterDetailPage() {
  const { id } = useParams<{ id: string }>(); const navigate = useNavigate();
  const { data: cluster, isLoading } = useCluster(id ?? '');
  if (isLoading) return <Skeleton height={400} />;
  if (!cluster) return <Text c="red">Cluster not found</Text>;

  return (
    <>
      <Group mb="md"><Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/clusters')}>Back</Button></Group>
      <Group mb="md">
        <div><Title order={2}>{cluster.name}</Title><Group gap="xs"><Text c="dimmed" size="sm">{cluster.region}</Text><Badge variant="light" size="sm">{cluster.gpu_type}</Badge></Group></div>
        <Badge variant="dot" size="lg" color={cluster.status === 'healthy' ? 'green' : 'yellow'} ml="auto">{cluster.status}</Badge>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="md">
        <Paper withBorder p="md" radius="md"><Text size="xs" c="dimmed" tt="uppercase">Nodes</Text><Text fw={700} size="lg">{cluster.healthy_nodes}/{cluster.node_count}</Text></Paper>
        <Paper withBorder p="md" radius="md"><Text size="xs" c="dimmed" tt="uppercase">Total GPUs</Text><Text fw={700} size="lg">{cluster.total_gpu}</Text></Paper>
        <Paper withBorder p="md" radius="md"><Text size="xs" c="dimmed" tt="uppercase">Avg GPU Util</Text><Group gap="xs"><Progress value={cluster.avg_gpu_util} size="lg" w={80} color={cluster.avg_gpu_util > 80 ? 'red' : cluster.avg_gpu_util > 60 ? 'yellow' : 'green'} /><Text fw={700} size="lg">{cluster.avg_gpu_util}%</Text></Group></Paper>
        <Paper withBorder p="md" radius="md"><Text size="xs" c="dimmed" tt="uppercase">GPU Type</Text><Text fw={700} size="lg">{cluster.gpu_type}</Text></Paper>
      </SimpleGrid>
      <Title order={4} mb="sm">Nodes</Title>
      <Paper withBorder p="lg" radius="md">
        <Table striped highlightOnHover>
          <Table.Thead><Table.Tr><Table.Th>Hostname</Table.Th><Table.Th>GPU</Table.Th><Table.Th>GPUs</Table.Th><Table.Th>Driver</Table.Th><Table.Th>CUDA</Table.Th><Table.Th>Status</Table.Th><Table.Th></Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>{(cluster.nodes ?? []).map((node: any) => (
            <Table.Tr key={node.id}>
              <Table.Td><Text size="sm" fw={500}>{node.hostname}</Text></Table.Td>
              <Table.Td><Badge variant="light" size="sm">{node.gpu_model}</Badge></Table.Td>
              <Table.Td><Text size="sm">{node.gpu_count}</Text></Table.Td>
              <Table.Td><Text size="xs" c="dimmed">{node.driver_version}</Text></Table.Td>
              <Table.Td><Text size="xs" c="dimmed">{node.cuda_version}</Text></Table.Td>
              <Table.Td><Badge variant="dot" size="sm" color={node.status === 'online' ? 'green' : node.status === 'degraded' ? 'yellow' : 'red'}>{node.status}</Badge></Table.Td>
              <Table.Td><Button size="xs" variant="light" leftSection={<IconCpu size={12} />} onClick={() => navigate(`/clusters/${cluster.id}/nodes/${node.id}`)}>GPUs</Button></Table.Td>
            </Table.Tr>
          ))}</Table.Tbody>
        </Table>
      </Paper>
    </>
  );
}
