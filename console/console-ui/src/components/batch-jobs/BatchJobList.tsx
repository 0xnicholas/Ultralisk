import { Table, Badge, Text, Group, ActionIcon, Skeleton, Tooltip } from '@mantine/core';
import { IconEye, IconX, IconDownload } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useBatchJobs, useCancelBatchJob } from '@/hooks/useBatchJobs';
import { formatCurrency, formatTokens } from '@/utils/format';
import type { BatchJob } from '@/types';

const statusColor: Record<string, string> = {
  pending: 'gray',
  running: 'blue',
  completed: 'green',
  failed: 'red',
};

export function BatchJobList() {
  const { data: jobs, isLoading } = useBatchJobs();
  const cancelMutation = useCancelBatchJob();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Model</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Tokens</Table.Th>
            <Table.Th>Cost</Table.Th>
            <Table.Th>Submitted</Table.Th>
            <Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {[1, 2, 3].map((i) => (
            <Table.Tr key={i}>
              {[1, 2, 3, 4, 5, 6, 7].map((j) => (
                <Table.Td key={j}>
                  <Skeleton height={20} />
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    );
  }

  const rows = (jobs ?? []).map((job: BatchJob) => (
    <Table.Tr key={job.id}>
      <Table.Td>
        <Text size="sm" fw={500}>
          {job.name}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text size="xs" c="dimmed">
          {job.model_id}
        </Text>
      </Table.Td>
      <Table.Td>
        <Badge variant="light" color={statusColor[job.status]} size="sm">
          {job.status}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Text size="sm">{job.token_count ? formatTokens(job.token_count) : '-'}</Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm">{job.cost ? formatCurrency(job.cost) : '-'}</Text>
      </Table.Td>
      <Table.Td>
        <Text size="xs" c="dimmed">
          {new Date(job.created_at).toLocaleString()}
        </Text>
      </Table.Td>
      <Table.Td>
        <Group gap={4}>
          <Tooltip label="View details">
            <ActionIcon
              variant="light"
              size="sm"
              onClick={() => navigate(`/batch-jobs/${job.id}`)}
            >
              <IconEye size={14} />
            </ActionIcon>
          </Tooltip>
          {job.status === 'running' || job.status === 'pending' ? (
            <Tooltip label="Cancel">
              <ActionIcon
                variant="light"
                color="red"
                size="sm"
                onClick={() => cancelMutation.mutate(job.id)}
              >
                <IconX size={14} />
              </ActionIcon>
            </Tooltip>
          ) : job.output_file ? (
            <Tooltip label="Download">
              <ActionIcon variant="light" size="sm">
                <IconDownload size={14} />
              </ActionIcon>
            </Tooltip>
          ) : null}
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Table striped highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Name</Table.Th>
          <Table.Th>Model</Table.Th>
          <Table.Th>Status</Table.Th>
          <Table.Th>Tokens</Table.Th>
          <Table.Th>Cost</Table.Th>
          <Table.Th>Submitted</Table.Th>
          <Table.Th></Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>{rows}</Table.Tbody>
    </Table>
  );
}
