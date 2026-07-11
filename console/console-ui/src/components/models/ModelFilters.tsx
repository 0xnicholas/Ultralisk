import { Group, SegmentedControl, Text } from '@mantine/core';

interface Props {
  filters: { deployment?: string; category?: string; feature?: string };
  onChange: (f: Props['filters']) => void;
}

export function ModelFilters({ filters, onChange }: Props) {
  return (
    <Group mb="md" gap="lg">
      <div>
        <Text size="xs" fw={500} c="dimmed" mb={4}>Deployment</Text>
        <SegmentedControl size="xs" data={[{ label: 'All', value: '' }, { label: 'Serverless', value: 'serverless' }, { label: 'Dedicated', value: 'dedicated' }]} value={filters.deployment ?? ''} onChange={(v) => onChange({ ...filters, deployment: v })} />
      </div>
      <div>
        <Text size="xs" fw={500} c="dimmed" mb={4}>Category</Text>
        <SegmentedControl size="xs" data={[{ label: 'All', value: '' }, { label: 'Chat', value: 'chat' }, { label: 'Embedding', value: 'embedding' }, { label: 'Vision', value: 'image' }]} value={filters.category ?? ''} onChange={(v) => onChange({ ...filters, category: v })} />
      </div>
      <div>
        <Text size="xs" fw={500} c="dimmed" mb={4}>Features</Text>
        <SegmentedControl size="xs" data={[{ label: 'All', value: '' }, { label: 'JSON Mode', value: 'json_mode' }, { label: 'Tool Calling', value: 'tool_calling' }, { label: 'Multi-Modal', value: 'multi_modal' }]} value={filters.feature ?? ''} onChange={(v) => onChange({ ...filters, feature: v })} />
      </div>
    </Group>
  );
}
