import { Title, Button, Group, Paper } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { EndpointList } from '@/components/endpoints/EndpointList';

export function EndpointsPage() {
  const navigate = useNavigate();
  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Endpoints</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/endpoints/new')}>Create Endpoint</Button>
      </Group>
      <Paper withBorder p="lg" radius="md"><EndpointList /></Paper>
    </>
  );
}
