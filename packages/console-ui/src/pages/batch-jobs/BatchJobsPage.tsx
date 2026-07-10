import { Title, Button, Group, Paper } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { BatchJobList } from '@/components/batch-jobs/BatchJobList';

export function BatchJobsPage() {
  const navigate = useNavigate();
  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Batch Jobs</Title>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => navigate('/batch-jobs/new')}
        >
          Create Batch Job
        </Button>
      </Group>
      <Paper withBorder p="lg" radius="md">
        <BatchJobList />
      </Paper>
    </>
  );
}
