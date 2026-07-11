import { SimpleGrid, Paper, Text, Group, Skeleton } from '@mantine/core';
import { IconArrowsExchange, IconCoins, IconCash, IconWallet } from '@tabler/icons-react';
import { useUsage } from '@/hooks/useUsage';
import { useBilling } from '@/hooks/useBilling';
import { formatNumber, formatTokens, formatCurrency } from '@/utils/format';

export function UsageSummaryCards() {
  const { data: usage, isLoading: usageLoading } = useUsage();
  const { data: billing, isLoading: billingLoading } = useBilling();
  const loading = usageLoading || billingLoading;

  const cards = [
    { label: "Today's Requests", value: usage ? formatNumber(usage.totals.requests) : '-', icon: IconArrowsExchange, color: 'blue' },
    { label: "Today's Tokens", value: usage ? formatTokens(usage.totals.input_tokens + usage.totals.output_tokens) : '-', icon: IconCoins, color: 'violet' },
    { label: "Today's Cost", value: usage ? formatCurrency(usage.totals.cost_usd) : '-', icon: IconCash, color: 'green' },
    { label: 'Balance', value: billing ? formatCurrency(billing.balance_usd) : '-', icon: IconWallet, color: 'orange' },
  ];

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="md">
      {cards.map((card) => (
        <Paper withBorder p="md" radius="md" key={card.label}>
          {loading ? <Skeleton height={50} /> : (
            <Group>
              <card.icon size={24} color={`var(--mantine-color-${card.color}-6)`} />
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{card.label}</Text>
                <Text fw={700} size="lg">{card.value}</Text>
              </div>
            </Group>
          )}
        </Paper>
      ))}
    </SimpleGrid>
  );
}
