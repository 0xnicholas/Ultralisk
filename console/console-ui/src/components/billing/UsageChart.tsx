import { Paper, Text, SegmentedControl, Group, SimpleGrid } from '@mantine/core';
import { useState } from 'react';
import { DonutChart, BarChart } from '@mantine/charts';
import { useUsage } from '@/hooks/useUsage';

export function UsageChart() {
  const [range, setRange] = useState('today');
  const { data: usage } = useUsage(range);

  const donutData = (usage?.by_model ?? []).map((m, i) => ({
    name: m.model_display_name,
    value: m.cost_usd,
    color: ['violet', 'blue', 'green', 'orange', 'pink'][i % 5],
  }));

  const barData = (usage?.by_model ?? []).map((m) => ({
    model: m.model_display_name,
    'Input Tokens': m.input_tokens,
    'Output Tokens': m.output_tokens,
  }));

  return (
    <Paper withBorder p="lg" radius="md" mb="md">
      <Group justify="space-between" mb="md">
        <Text size="sm" fw={500}>
          Usage
        </Text>
        <SegmentedControl
          size="xs"
          data={[
            { label: 'Today', value: 'today' },
            { label: '7 Days', value: '7d' },
            { label: '30 Days', value: '30d' },
          ]}
          value={range}
          onChange={setRange}
        />
      </Group>
      {usage && (
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <div>
            <Text size="xs" c="dimmed" ta="center" mb="sm">
              Cost by Model
            </Text>
            <DonutChart
              data={donutData}
              size={180}
              thickness={20}
              withLabels
              withLabelsLine
            />
          </div>
          <div>
            <Text size="xs" c="dimmed" ta="center" mb="sm">
              Tokens by Model
            </Text>
            <BarChart
              h={180}
              data={barData}
              dataKey="model"
              series={[
                { name: 'Input Tokens', color: 'violet.6' },
                { name: 'Output Tokens', color: 'blue.6' },
              ]}
              tickLine="none"
              gridAxis="y"
            />
          </div>
        </SimpleGrid>
      )}
    </Paper>
  );
}
