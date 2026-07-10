import { Paper, Text, Table, Badge } from '@mantine/core';
import { useUsage } from '@/hooks/useUsage';
import { formatRelativeTime } from '@/utils/format';

export function RecentActivity() {
  const { data: usage, isLoading } = useUsage();
  if (isLoading || !usage?.recent_activity?.length) return null;

  return (
    <Paper withBorder p="lg" radius="md" mb="md">
      <Text size="sm" fw={500} mb="sm">Recent Activity</Text>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Time</Table.Th><Table.Th>Model</Table.Th><Table.Th>Status</Table.Th><Table.Th>Latency</Table.Th><Table.Th>Tokens</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {usage.recent_activity.slice(0, 10).map((item, i) => (
            <Table.Tr key={i}>
              <Table.Td>{formatRelativeTime(item.timestamp)}</Table.Td>
              <Table.Td>{item.model_id}</Table.Td>
              <Table.Td><Badge color={item.status_code < 400 ? 'green' : item.status_code < 500 ? 'yellow' : 'red'} variant="light">{item.status_code}</Badge></Table.Td>
              <Table.Td>{item.latency_ms}ms</Table.Td>
              <Table.Td>{item.tokens}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}
