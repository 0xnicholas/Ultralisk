import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Title, Paper, TextInput, Select, NumberInput, Button, Group, Stack } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useCreateEndpoint } from '@/hooks/useEndpoints';
import { useModels } from '@/hooks/useModels';

export function CreateEndpointPage() {
  const navigate = useNavigate();
  const createMutation = useCreateEndpoint();
  const { data: models } = useModels();
  const [name, setName] = useState('');
  const [modelId, setModelId] = useState('');
  const [type, setType] = useState<'reserved' | 'dedicated'>('reserved');
  const [replicas, setReplicas] = useState(1);
  const modelOptions = (models ?? []).map((m) => ({ value: m.id, label: m.display_name }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMutation.mutateAsync({ name, model_id: modelId, type, replicas });
    navigate('/endpoints', { replace: true });
  };

  return (
    <>
      <Group mb="md"><Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/endpoints')}>Back</Button></Group>
      <Title order={2} mb="md">Create Endpoint</Title>
      <Paper withBorder p="lg" radius="md" maw={560}>
        <form onSubmit={handleSubmit}>
          <Stack>
            <TextInput label="Endpoint Name" placeholder="my-model-prod" required value={name} onChange={(e) => setName(e.currentTarget.value)} />
            <Select label="Model" placeholder="Select" data={modelOptions} value={modelId} onChange={(v) => v && setModelId(v)} searchable required />
            <Select label="Type" data={[{ value: 'reserved', label: 'Reserved' }, { value: 'dedicated', label: 'Dedicated' }]} value={type} onChange={(v) => setType(v as 'reserved' | 'dedicated')} />
            <NumberInput label="Replicas" value={replicas} onChange={(v) => setReplicas(typeof v === 'number' ? v : 1)} min={1} max={10} />
            <Group justify="flex-end"><Button variant="default" onClick={() => navigate('/endpoints')}>Cancel</Button><Button type="submit" loading={createMutation.isPending}>Create</Button></Group>
          </Stack>
        </form>
      </Paper>
    </>
  );
}
