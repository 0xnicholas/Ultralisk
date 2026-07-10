import { useParams, useNavigate } from 'react-router-dom';
import {
  Title,
  Paper,
  Text,
  Group,
  Button,
  Skeleton,
  Stack,
  Badge,
  Code,
} from '@mantine/core';
import { IconArrowLeft, IconDownload } from '@tabler/icons-react';
import { useBatchJob, useCancelBatchJob } from '@/hooks/useBatchJobs';
import { formatCurrency, formatTokens } from '@/utils/format';

const statusColor: Record<string, string> = {
  pending: 'gray',
  running: 'blue',
  completed: 'green',
  failed: 'red',
};

export function BatchJobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: job, isLoading } = useBatchJob(id ?? '');
  const cancelMutation = useCancelBatchJob();

  if (isLoading) return <Skeleton height={400} />;
  if (!job) return <Text c="red">Batch job not found</Text>;

  return (
    <>
      <Group mb="md">
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => navigate('/batch-jobs')}
        >
          Back
        </Button>
      </Group>
      <Group justify="space-between" mb="md">
        <div>
          <Title order={2}>{job.name}</Title>
          <Group gap="xs">
            <Text c="dimmed" size="sm">
              {job.model_id}
            </Text>
            <Badge variant="light" color={statusColor[job.status]}>
              {job.status}
            </Badge>
          </Group>
        </div>
        {job.status === 'running' || job.status === 'pending' ? (
          <Button
            color="red"
            variant="light"
            onClick={() => cancelMutation.mutate(id!)}
            loading={cancelMutation.isPending}
          >
            Cancel
          </Button>
        ) : job.output_file ? (
          <Button leftSection={<IconDownload size={16} />}>Download</Button>
        ) : null}
      </Group>
      <Paper withBorder p="lg" radius="md" mb="md">
        <Text size="sm" fw={500} mb="sm">
          Details
        </Text>
        <Stack gap="xs">
          <Group>
            <Text size="sm" fw={500}>
              Input:
            </Text>
            <Text size="sm">{job.input_file}</Text>
          </Group>
          {job.output_file && (
            <Group>
              <Text size="sm" fw={500}>
                Output:
              </Text>
              <Text size="sm">{job.output_file}</Text>
            </Group>
          )}
          {job.callback_url && (
            <Group>
              <Text size="sm" fw={500}>
                Callback:
              </Text>
              <Text size="sm">{job.callback_url}</Text>
            </Group>
          )}
          <Group>
            <Text size="sm" fw={500}>
              Tokens:
            </Text>
            <Text size="sm">
              {job.token_count ? formatTokens(job.token_count) : '-'}
            </Text>
          </Group>
          <Group>
            <Text size="sm" fw={500}>
              Cost:
            </Text>
            <Text size="sm">{job.cost ? formatCurrency(job.cost) : 'Pending'}</Text>
          </Group>
          <Group>
            <Text size="sm" fw={500}>
              Created:
            </Text>
            <Text size="sm">{new Date(job.created_at).toLocaleString()}</Text>
          </Group>
          {job.completed_at && (
            <Group>
              <Text size="sm" fw={500}>
                Completed:
              </Text>
              <Text size="sm">{new Date(job.completed_at).toLocaleString()}</Text>
            </Group>
          )}
        </Stack>
      </Paper>
      {job.error_log && job.error_log.length > 0 && (
        <Paper withBorder p="lg" radius="md">
          <Text size="sm" fw={500} mb="sm" c="red">
            Errors ({job.error_log.length})
          </Text>
          {job.error_log.map((err, i) => (
            <Group key={i} mb={4}>
              <Badge size="xs" color="red">
                Line {err.line}
              </Badge>
              <Code>{err.error}</Code>
            </Group>
          ))}
        </Paper>
      )}
    </>
  );
}
