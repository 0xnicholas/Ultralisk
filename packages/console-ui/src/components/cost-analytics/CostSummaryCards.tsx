import { SimpleGrid, Paper, Text, Group, ThemeIcon } from '@mantine/core';
import { IconCash, IconCoins, IconCpu, IconChartPie } from '@tabler/icons-react';
import { formatCurrency } from '@/utils/format';
import type { CostAnalyticsSummary } from '@/types';

export function CostSummaryCards({ data }: { data: CostAnalyticsSummary }) {
  const cards = [
    { label: 'Total Cost', value: formatCurrency(data.total_cost_usd), icon: IconCash, color: 'red' },
    { label: 'Token Cost', value: formatCurrency(data.token_cost_usd), icon: IconCoins, color: 'violet' },
    { label: 'GPU Hour Cost', value: formatCurrency(data.gpu_hour_cost_usd), icon: IconCpu, color: 'blue' },
    { label: 'Budget Used', value: `${data.budget_used_pct}%`, sub: `of ${formatCurrency(data.budget_usd)}`, icon: IconChartPie, color: data.budget_used_pct > 80 ? 'red' : 'green' as string },
  ];
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="md">
      {cards.map((card) => (
        <Paper key={card.label} withBorder p="md" radius="md">
          <Group><ThemeIcon variant="light" color={card.color} size="lg"><card.icon size={20} /></ThemeIcon>
            <div><Text size="xs" c="dimmed" tt="uppercase" fw={700}>{card.label}</Text><Text fw={700} size="lg">{card.value}</Text>{card.sub && <Text size="xs" c="dimmed">{card.sub}</Text>}</div>
          </Group>
        </Paper>
      ))}
    </SimpleGrid>
  );
}
