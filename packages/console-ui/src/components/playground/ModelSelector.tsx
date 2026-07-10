import { Select, Badge, Group, Text } from '@mantine/core';
import { useModels } from '@/hooks/useModels';
import type { Model } from '@/types';

interface Props { value: string; onChange: (modelId: string) => void; }

export function ModelSelector({ value, onChange }: Props) {
  const { data: models } = useModels();
  const options = (models ?? []).map((m: Model) => ({ value: m.id, label: m.display_name, disabled: m.status !== 'available' }));
  const selectedModel = models?.find((m) => m.id === value);
  return (
    <Group gap="xs">
      <Select data={options} value={value} onChange={(v) => v && onChange(v)} searchable placeholder="Select a model" style={{ minWidth: 280 }}
        renderOption={({ option }) => (<Group><Text size="sm">{option.label}</Text>{option.disabled && <Badge size="xs" color="red" variant="light">Unavailable</Badge>}</Group>)} />
      {selectedModel && selectedModel.status !== 'available' && <Badge color="red" variant="light">{selectedModel.status === 'degraded' ? 'Degraded — try another model' : 'Unavailable'}</Badge>}
    </Group>
  );
}
