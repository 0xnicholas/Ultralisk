import { Paper, Text, Group, Button, Stack, RingProgress } from '@mantine/core';
import { useBilling } from '@/hooks/useBilling';
import { formatCurrency } from '@/utils/format';

export function BalanceCard() {
  const { data: billing } = useBilling();

  if (!billing) return null;

  const budgetPct = billing.monthly_budget_usd
    ? Math.min((billing.month_to_date_spend_usd / billing.monthly_budget_usd) * 100, 100)
    : 0;

  return (
    <Paper withBorder p="lg" radius="md" mb="md">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Stack gap="xs">
          <Text size="sm" fw={500} c="dimmed">
            Current Balance
          </Text>
          <Text size="xl" fw={700}>
            {formatCurrency(billing.balance_usd)}
          </Text>
          <Group gap="xs">
            <Button size="xs" variant="light">Add Funds</Button>
            {billing.auto_recharge_enabled ? (
              <Text size="xs" c="dimmed">Auto-recharge enabled</Text>
            ) : (
              <Button size="xs" variant="subtle">Enable Auto-recharge</Button>
            )}
          </Group>
        </Stack>
        {billing.monthly_budget_usd && (
          <Stack align="center" gap={4}>
            <Text size="xs" c="dimmed">Monthly Budget</Text>
            <RingProgress
              size={100}
              thickness={8}
              sections={[
                {
                  value: budgetPct,
                  color: budgetPct > 90 ? 'red' : budgetPct > 75 ? 'yellow' : 'violet',
                },
              ]}
              label={
                <Text size="xs" ta="center" fw={700}>
                  {budgetPct.toFixed(0)}%
                </Text>
              }
            />
            <Text size="xs" c="dimmed">
              {formatCurrency(billing.month_to_date_spend_usd)} /{' '}
              {formatCurrency(billing.monthly_budget_usd)}
            </Text>
            <Text size="xs" c="dimmed">
              Est. month end: {formatCurrency(billing.estimated_month_end_usd)}
            </Text>
          </Stack>
        )}
      </Group>
    </Paper>
  );
}
