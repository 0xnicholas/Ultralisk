import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Title, Paper, Text, Group, Button, Skeleton, Badge, Table, NumberInput, SimpleGrid } from '@mantine/core';
import { IconArrowLeft, IconRefresh } from '@tabler/icons-react';
import { useDeployment, useScaleDeployment, useRollbackDeployment } from '@/hooks/useDeployments';
import { formatRelativeTime } from '@/utils/format';
import type { DeploymentVersion } from '@/types';

export function DeploymentDetailPage() {
  const { id } = useParams<{ id: string }>(); const navigate = useNavigate();
  const { data: dep, isLoading } = useDeployment(id ?? '');
  const scaleMutation = useScaleDeployment(); const rollbackMutation = useRollbackDeployment();
  const [replicas, setReplicas] = useState(1);
  // Sync replicas from API data when loaded
  useEffect(() => { if (dep?.replicas !== undefined) { setReplicas(dep.replicas); } }, [dep?.replicas]);

  if (isLoading) return <Skeleton height={400} />;
  if (!dep) return <Text c="red">Deployment not found</Text>;

  return (
    <>
      <Group mb="md"><Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/deployments')}>Back</Button></Group>
      <Group justify="space-between" mb="md">
        <div><Title order={2}>{dep.name}</Title><Group gap="xs"><Text c="dimmed" size="sm">{dep.model_id}</Text><Badge variant="light" size="sm">{dep.cluster_id}</Badge></Group></div>
        <Badge variant="dot" size="lg" color={dep.status === 'active' ? 'green' : dep.status === 'degraded' ? 'yellow' : 'blue'}>{dep.status}</Badge>
      </Group>
      <SimpleGrid cols={{ base: 1, md: 2 }} mb="md">
        <Paper withBorder p="lg" radius="md">
          <Text size="sm" fw={500} mb="sm">Scale</Text>
          <Group><NumberInput value={replicas} onChange={(v) => setReplicas(typeof v === 'number' ? v : 1)} min={0} max={20} w={100} />
            <Button size="sm" onClick={() => scaleMutation.mutate({ id: dep.id, replicas })} loading={scaleMutation.isPending} disabled={replicas === dep.replicas}>Scale</Button></Group>
          <Text size="xs" c="dimmed" mt={4}>Current: {dep.replicas} replicas · {dep.gpu_per_replica} GPU each</Text>
        </Paper>
        <Paper withBorder p="lg" radius="md">
          <Text size="sm" fw={500} mb="sm">Rollback</Text>
          <Button variant="light" color="orange" leftSection={<IconRefresh size={16} />} onClick={() => rollbackMutation.mutate(dep.id)} loading={rollbackMutation.isPending}>Rollback to Previous</Button>
          <Text size="xs" c="dimmed" mt={4}>Rolls back to the last active version</Text>
        </Paper>
      </SimpleGrid>
      {dep.versions && dep.versions.length > 0 && (
        <Paper withBorder p="lg" radius="md">
          <Text size="sm" fw={500} mb="sm">Version History</Text>
          <Table striped highlightOnHover>
            <Table.Thead><Table.Tr><Table.Th>Version</Table.Th><Table.Th>Image</Table.Th><Table.Th>Deployed</Table.Th><Table.Th>Status</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{dep.versions.map((v: DeploymentVersion) => (
              <Table.Tr key={v.version}>
                <Table.Td><Text fw={500}>v{v.version}</Text></Table.Td>
                <Table.Td><Text size="xs" ff="mono">{v.image}</Text></Table.Td>
                <Table.Td><Text size="sm">{formatRelativeTime(v.deployed_at)}</Text></Table.Td>
                <Table.Td><Badge variant="light" size="sm" color={v.status === 'active' ? 'green' : 'gray'}>{v.status}</Badge></Table.Td>
              </Table.Tr>
            ))}</Table.Tbody>
          </Table>
        </Paper>
      )}
    </>
  );
}
