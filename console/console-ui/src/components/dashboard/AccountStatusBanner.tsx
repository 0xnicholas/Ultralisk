import { Alert, Group, Text, Button } from '@mantine/core';
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { useBilling } from '@/hooks/useBilling';
import { formatCurrency } from '@/utils/format';
import { useNavigate } from 'react-router-dom';

export function AccountStatusBanner() {
  const { data: billing, isLoading } = useBilling();
  const navigate = useNavigate();

  if (isLoading || !billing) return null;

  if (billing.balance_usd <= 0) {
    return (
      <Alert color="yellow" icon={<IconAlertTriangle size={20} />} mb="md">
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm">Make an initial deposit to start using the API.</Text>
          <Button size="xs" variant="filled" onClick={() => navigate('/billing')}>
            Add Funds
          </Button>
        </Group>
      </Alert>
    );
  }

  const pctUsed = billing.monthly_budget_usd
    ? ((billing.month_to_date_spend_usd / billing.monthly_budget_usd) * 100).toFixed(0)
    : null;

  return (
    <Alert color="green" icon={<IconCheck size={20} />} mb="md">
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm">
          Balance: {formatCurrency(billing.balance_usd)}
          {pctUsed && ` · MTD: ${formatCurrency(billing.month_to_date_spend_usd)} (${pctUsed}% of budget)`}
        </Text>
      </Group>
    </Alert>
  );
}
