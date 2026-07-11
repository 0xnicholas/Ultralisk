import { useParams, useNavigate } from 'react-router-dom';
import { Title, Paper, Text, Group, Button, Skeleton, Stack, Badge, SimpleGrid } from '@mantine/core';
import { IconArrowLeft, IconTrash } from '@tabler/icons-react';
import { useEndpoint, useDeleteEndpoint } from '@/hooks/useEndpoints';
import { EndpointMetrics } from '@/components/endpoints/EndpointMetrics';
import { AutoscalingPolicy } from '@/components/endpoints/AutoscalingPolicy';

export function EndpointDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: endpoint, isLoading } = useEndpoint(id ?? '');
  const deleteMutation = useDeleteEndpoint();

  if (isLoading) return <Skeleton height={400} />;
  if (!endpoint) return <Text c="red">Endpoint not found</Text>;

  const handleDelete = async () => { await deleteMutation.mutateAsync(id!); navigate('/endpoints', { replace: true }); };

  return (
    <>
      <Group mb="md"><Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/endpoints')}>Back</Button></Group>
      <Group justify="space-between" mb="md">
        <div><Title order={2}>{endpoint.name}</Title><Group gap="xs"><Text c="dimmed" size="sm">{endpoint.model_id}</Text><Badge variant="light" size="sm">{endpoint.type}</Badge></Group></div>
        <Button color="red" variant="light" leftSection={<IconTrash size={16} />} onClick={handleDelete} loading={deleteMutation.isPending}>Delete</Button>
      </Group>
      <EndpointMetrics endpoint={endpoint} />
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Paper withBorder p="lg" radius="md">
          <Text size="sm" fw={500} mb="sm">Configuration</Text>
          <Stack gap="xs">
            <Group><Text size="sm" fw={500}>GPU:</Text><Text size="sm">{endpoint.gpu_spec.count}x {endpoint.gpu_spec.type}</Text></Group>
            <Group><Text size="sm" fw={500}>Replicas:</Text><Text size="sm">{endpoint.replicas}</Text></Group>
            <Group><Text size="sm" fw={500}>Status:</Text><Badge variant="dot" color={endpoint.status === 'active' ? 'green' : 'yellow'}>{endpoint.status}</Badge></Group>
            <Group><Text size="sm" fw={500}>Created:</Text><Text size="sm">{new Date(endpoint.created_at).toLocaleDateString()}</Text></Group>
          </Stack>
        </Paper>
        <AutoscalingPolicy endpoint={endpoint} />
      </SimpleGrid>
    </>
  );
}
