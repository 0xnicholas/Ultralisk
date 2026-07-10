import { Paper, Text, Table, Badge, ActionIcon, Tooltip } from '@mantine/core';
import { useBilling } from '@/hooks/useBilling';
import { formatCurrency } from '@/utils/format';
import { IconDownload } from '@tabler/icons-react';

export function InvoicesTable() {
  const { data: billing } = useBilling();

  if (!billing?.invoices?.length) return null;

  return (
    <Paper withBorder p="lg" radius="md" mb="md">
      <Text size="sm" fw={500} mb="sm">
        Invoices
      </Text>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Period</Table.Th>
            <Table.Th>Amount</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Issued</Table.Th>
            <Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {billing.invoices.map((inv) => (
            <Table.Tr key={inv.id}>
              <Table.Td>{inv.period}</Table.Td>
              <Table.Td>{formatCurrency(inv.amount_usd)}</Table.Td>
              <Table.Td>
                <Badge
                  size="sm"
                  variant="light"
                  color={
                    inv.status === 'paid'
                      ? 'green'
                      : inv.status === 'overdue'
                        ? 'red'
                        : 'yellow'
                  }
                >
                  {inv.status}
                </Badge>
              </Table.Td>
              <Table.Td>{new Date(inv.issued_at).toLocaleDateString()}</Table.Td>
              <Table.Td>
                <Tooltip label="Download invoice">
                  <ActionIcon variant="subtle" size="sm" component="a" href={inv.download_url} target="_blank">
                    <IconDownload size={14} />
                  </ActionIcon>
                </Tooltip>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}
