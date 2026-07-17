import { Button, TextInput, Select, Text, Group, Alert, Code, Stack } from '@mantine/core';
import { IconCircleCheck, IconAlertCircle } from '@tabler/icons-react';
import { useState } from 'react';

interface StorageState {
  configured: boolean;
  type: 's3' | 'minio' | '';
  endpoint: string;
}

export function StorageStep({ state, onChange }: { state: StorageState; onChange: (s: StorageState) => void }) {
  const [configuring, setConfiguring] = useState(false);
  const [error, setError] = useState('');

  const handleConfigure = async () => {
    setConfiguring(true);
    setError('');
    await new Promise((r) => setTimeout(r, 1000));
    if (!state.type) {
      setError('Please select a storage type');
      setConfiguring(false);
      return;
    }
    if (!state.endpoint) {
      setError('Please enter an endpoint URL');
      setConfiguring(false);
      return;
    }
    onChange({ ...state, configured: true });
    setConfiguring(false);
  };

  if (state.configured) {
    return (
      <Stack gap="md">
        <Alert variant="light" color="green" title="Storage Configured" icon={<IconCircleCheck size={16} />}>
          {state.type === 's3' ? 'Amazon S3' : 'MinIO'} storage connected at <Code>{state.endpoint}</Code>
        </Alert>
        <Text size="sm" c="dimmed">Model weights and artifacts will be stored in this location.</Text>
        <Button variant="light" color="gray" onClick={() => onChange({ ...state, configured: false })}>
          Re-configure
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Configure object storage for model weights and inference artifacts.
      </Text>
      <Select
        label="Storage Type"
        placeholder="Select storage type"
        data={[
          { value: 's3', label: 'Amazon S3' },
          { value: 'minio', label: 'MinIO (Self-hosted)' },
        ]}
        value={state.type}
        onChange={(v) => onChange({ ...state, type: (v as StorageState['type']) || '' })}
        required
      />
      <TextInput
        label="Endpoint URL"
        placeholder={state.type === 'minio' ? 'http://minio:9000' : 'https://s3.us-east-1.amazonaws.com'}
        value={state.endpoint}
        onChange={(e) => onChange({ ...state, endpoint: e.currentTarget.value })}
        required
      />
      {error && (
        <Alert variant="light" color="red" title="Configuration Error" icon={<IconAlertCircle size={16} />}>
          {error}
        </Alert>
      )}
      <Group>
        <Button onClick={handleConfigure} loading={configuring}>Configure Storage</Button>
      </Group>
    </Stack>
  );
}
