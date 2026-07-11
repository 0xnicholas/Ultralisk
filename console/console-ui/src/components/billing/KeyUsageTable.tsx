import { Table, Text, Paper } from '@mantine/core';
import { useUsage } from '@/hooks/useUsage';
import { formatCurrency, formatTokens } from '@/utils/format';

export function KeyUsageTable() {
  const { data: usage } = useUsage();

  if (!usage?.by_key?.length) return null;

  return (
    <Paper withBorder p="lg" radius="md">
      <Text size="sm" fw={500} mb="sm">
        Usage by API Key
      </Text>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Key</Table.Th>
            <Table.Th>Requests</Table.Th>
            <Table.Th>Input Tokens</Table.Th>
            <Table.Th>Output Tokens</Table.Th>
            <Table.Th>Cost</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {usage.by_key.map((k) => (
            <Table.Tr key={k.key_id}>
              <Table.Td>
                <Text size="sm" fw={500}>{k.key_name}</Text>
                <Text size="xs" c="dimmed" ff="mono">{k.key_prefix}</Text>
              </Table.Td>
              <Table.Td>{k.requests.toLocaleString()}</Table.Td>
              <Table.Td>{formatTokens(k.input_tokens)}</Table.Td>
              <Table.Td>{formatTokens(k.output_tokens)}</Table.Td>
              <Table.Td>{formatCurrency(k.cost_usd)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}
