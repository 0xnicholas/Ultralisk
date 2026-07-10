import { SimpleGrid, Paper, Text, Badge, Group, Button, Skeleton, Stack } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { useModels } from '@/hooks/useModels';
import { formatCurrency } from '@/utils/format';
import type { Model } from '@/types';

function FeaturedCard({ model }: { model: Model }) {
  const navigate = useNavigate();
  return (
    <Paper withBorder p="lg" radius="md">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Text fw={600} size="sm" lineClamp={1}>{model.display_name}</Text>
          <Badge variant="light" size="xs">{model.author}</Badge>
        </Group>
        <Group gap={4}>
          {model.capabilities.json_mode && <Badge variant="outline" size="xs">JSON</Badge>}
          {model.capabilities.tool_calling && <Badge variant="outline" size="xs">Tools</Badge>}
          {model.capabilities.multi_modal && <Badge variant="outline" size="xs">Vision</Badge>}
          {model.capabilities.fine_tuning && <Badge variant="outline" size="xs">FT</Badge>}
        </Group>
        <Text size="xs" c="dimmed">
          {formatCurrency(model.pricing.serverless.input_per_1m_tokens)} / {formatCurrency(model.pricing.serverless.output_per_1m_tokens)} per 1M tokens
        </Text>
        <Group>
          <Button size="xs" variant="light" onClick={() => navigate(`/playground?model=${model.id}`)}>Open in Playground</Button>
          <Button size="xs" variant="subtle" onClick={() => navigate(`/models/${model.id}`)}>View Details</Button>
        </Group>
      </Stack>
    </Paper>
  );
}

export function FeaturedModels() {
  const { data: models, isLoading } = useModels();
  if (isLoading) {
    return <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="md">{[1,2,3,4].map((i) => <Skeleton key={i} height={160} radius="md" />)}</SimpleGrid>;
  }
  const featured = (models ?? []).filter((m) => m.featured);
  return (
    <>
      <Text size="sm" fw={500} mb="xs">Featured Models</Text>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="lg">
        {featured.map((m) => <FeaturedCard key={m.id} model={m} />)}
      </SimpleGrid>
    </>
  );
}
