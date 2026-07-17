import { Button, TextInput, Text, Group, Alert, Code, Stack } from '@mantine/core';
import { IconCircleCheck, IconAlertCircle, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';

interface K8sState {
  connected: boolean;
  clusterName: string;
  nodeCount: number;
}

export function K8sStep({ state, onChange }: { state: K8sState; onChange: (s: K8sState) => void }) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const handleCheck = async () => {
    setChecking(true);
    setError('');
    // Simulate cluster check
    await new Promise((r) => setTimeout(r, 1500));
    if (state.clusterName.length < 3) {
      setError('Cluster name must be at least 3 characters');
      setChecking(false);
      return;
    }
    onChange({ ...state, connected: true, nodeCount: 4 });
    setChecking(false);
  };

  if (state.connected) {
    return (
      <Stack gap="md">
        <Alert variant="light" color="green" title="Cluster Connected" icon={<IconCircleCheck size={16} />}>
          Successfully connected to <Code>{state.clusterName}</Code>
        </Alert>
        <Text size="sm" c="dimmed">Detected {state.nodeCount} nodes in the cluster.</Text>
        <Button variant="light" color="gray" onClick={() => onChange({ ...state, connected: false })}>
          Re-configure
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Enter your Kubernetes cluster connection details. The setup will verify connectivity and detect available nodes.
      </Text>
      <TextInput
        label="Cluster Name"
        placeholder="e.g., ultralisk-prod"
        value={state.clusterName}
        onChange={(e) => onChange({ ...state, clusterName: e.currentTarget.value })}
        required
      />
      {error && (
        <Alert variant="light" color="red" title="Connection Failed" icon={<IconAlertCircle size={16} />}>
          {error}
        </Alert>
      )}
      <Group>
        <Button onClick={handleCheck} loading={checking} leftSection={<IconSearch size={16} />}>
          Check Connection
        </Button>
      </Group>
    </Stack>
  );
}
