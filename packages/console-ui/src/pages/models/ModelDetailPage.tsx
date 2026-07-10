import { useParams, useNavigate } from 'react-router-dom';
import { Title, Paper, Text, Badge, Group, Stack, Code, Button, Skeleton, SimpleGrid } from '@mantine/core';
import { IconArrowLeft, IconPlayerPlay } from '@tabler/icons-react';
import { useModel } from '@/hooks/useModels';
import { formatCurrency } from '@/utils/format';

export function ModelDetailPage() {
  const { modelId } = useParams<{ modelId: string }>();
  const navigate = useNavigate();
  const { data: model, isLoading } = useModel(modelId ?? '');

  if (isLoading) return <Skeleton height={400} />;
  if (!model) return <Text c="red">Model not found</Text>;

  return (
    <>
      <Group mb="md"><Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/models')}>Back to Models</Button></Group>
      <Title order={2} mb="xs">{model.display_name}</Title>
      <Text c="dimmed" mb="md">{model.description}</Text>
      <SimpleGrid cols={{ base: 1, md: 2 }} mb="lg">
        <Paper withBorder p="lg" radius="md">
          <Title order={4} mb="sm">Capabilities</Title>
          <Stack gap="xs">
            <Group><Text size="sm" fw={500}>Context Window:</Text><Text size="sm">{model.capabilities.context_window.toLocaleString()} tokens</Text></Group>
            <Group><Text size="sm" fw={500}>Max Output:</Text><Text size="sm">{model.capabilities.max_output_tokens.toLocaleString()} tokens</Text></Group>
            <Group gap={4}><Text size="sm" fw={500}>Features:</Text>
              {model.capabilities.json_mode && <Badge size="xs" variant="light">JSON Mode</Badge>}
              {model.capabilities.tool_calling && <Badge size="xs" variant="light">Tool Calling</Badge>}
              {model.capabilities.multi_modal && <Badge size="xs" variant="light">Multi-Modal</Badge>}
              {model.capabilities.fine_tuning && <Badge size="xs" variant="light">Fine-Tuning</Badge>}
            </Group>
            <Group><Text size="sm" fw={500}>Version:</Text><Badge size="xs" variant="outline">{model.version}</Badge></Group>
          </Stack>
        </Paper>
        <Paper withBorder p="lg" radius="md">
          <Title order={4} mb="sm">Pricing</Title>
          <Stack gap="xs">
            <Group><Text size="sm" fw={500}>Input:</Text><Text size="sm">{formatCurrency(model.pricing.serverless.input_per_1m_tokens)} / 1M tokens</Text></Group>
            <Group><Text size="sm" fw={500}>Output:</Text><Text size="sm">{formatCurrency(model.pricing.serverless.output_per_1m_tokens)} / 1M tokens</Text></Group>
            {model.pricing.serverless.cached_input_per_1m_tokens && <Group><Text size="sm" fw={500}>Cached Input:</Text><Text size="sm">{formatCurrency(model.pricing.serverless.cached_input_per_1m_tokens)} / 1M tokens</Text></Group>}
            {model.pricing.batch_discount_percent && <Group><Text size="sm" fw={500}>Batch Discount:</Text><Badge color="green">{model.pricing.batch_discount_percent}% off</Badge></Group>}
            {model.pricing.dedicated && <Group><Text size="sm" fw={500}>Dedicated:</Text><Text size="sm">{model.pricing.dedicated.gpu_type} @ {formatCurrency(model.pricing.dedicated.price_per_hour)}/hr</Text></Group>}
          </Stack>
        </Paper>
      </SimpleGrid>
      <Paper withBorder p="lg" radius="md" mb="md">
        <Title order={4} mb="sm">Quick Start</Title>
        <Text size="xs" c="dimmed" mb="sm">Use with OpenAI-compatible SDKs:</Text>
        <Code block mb="sm">{model.usage_examples.python}</Code>
      </Paper>
      <Button leftSection={<IconPlayerPlay size={16} />} onClick={() => navigate(`/playground?model=${model.id}`)}>Open in Playground</Button>
    </>
  );
}
