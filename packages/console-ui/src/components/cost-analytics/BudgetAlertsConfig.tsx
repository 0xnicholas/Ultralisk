import { Paper, Text, Group, Badge, RingProgress, Stack, Table, Switch } from '@mantine/core';
import { formatCurrency, formatRelativeTime } from '@/utils/format';
import type { BudgetAlertsConfig as BudgetConfig } from '@/types';

export function BudgetAlertsConfig({ data }: { data: BudgetConfig }) {
  return (
    <Paper withBorder p="lg" radius="md">
      <Group justify="space-between" mb="md">
        <Text size="sm" fw={500}>Budget & Alerts</Text>
        <Switch checked={data.alerts_enabled} label="Alerts enabled" />
      </Group>
      <Group gap="xl" mb="md">
        <RingProgress size={120} thickness={10}
          sections={[{ value: data.current_spend / data.budget_usd * 100, color: (data.current_spend / data.budget_usd) > 0.9 ? 'red' : (data.current_spend / data.budget_usd) > 0.7 ? 'yellow' : 'green' }]}
          label={<Text size="xs" ta="center" fw={700}>{((data.current_spend / data.budget_usd) * 100).toFixed(0)}%</Text>} />
        <Stack gap={4}>
          <Text size="sm">{formatCurrency(data.current_spend)} / {formatCurrency(data.budget_usd)}</Text>
          <Group gap={4}>{data.channels.map((c) => <Badge key={c} variant="light" size="sm">{c === 'email' ? '📧' : '💬'} {c}</Badge>)}</Group>
          <Text size="xs" c="dimmed">Suppression: {data.suppression_window_minutes}min</Text>
        </Stack>
      </Group>
      <Table striped highlightOnHover>
        <Table.Thead><Table.Tr><Table.Th>Threshold</Table.Th><Table.Th>Type</Table.Th><Table.Th>Value</Table.Th><Table.Th>Status</Table.Th><Table.Th>Triggered</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>{data.thresholds.map((t) => (
          <Table.Tr key={t.label}>
            <Table.Td><Text size="sm">{t.label}</Text></Table.Td>
            <Table.Td><Badge variant="light" size="xs">{t.type}</Badge></Table.Td>
            <Table.Td><Text size="sm">{t.type === 'percent' ? `${t.value}%` : `>${t.value}%`}</Text></Table.Td>
            <Table.Td><Badge variant="dot" size="sm" color={t.triggered ? 'yellow' : 'green'}>{t.triggered ? 'Firing' : 'OK'}</Badge></Table.Td>
            <Table.Td><Text size="xs" c="dimmed">{t.triggered_at ? formatRelativeTime(t.triggered_at) : '-'}</Text></Table.Td>
          </Table.Tr>
        ))}</Table.Tbody>
      </Table>
    </Paper>
  );
}
