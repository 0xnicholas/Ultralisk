import { Button, TextInput, Text, Group, Alert, Code, Stack, Paper, ThemeIcon } from '@mantine/core';
import { IconCircleCheck, IconAlertCircle, IconKey, IconCalendar } from '@tabler/icons-react';
import { useState } from 'react';

interface LicenseState {
  activated: boolean;
  key: string;
  expiresAt: string;
}

export function LicenseStep({ state, onChange }: { state: LicenseState; onChange: (s: LicenseState) => void }) {
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState('');

  const handleActivate = async () => {
    setActivating(true);
    setError('');
    await new Promise((r) => setTimeout(r, 1500));
    if (state.key.length < 10) {
      setError('Invalid license key format');
      setActivating(false);
      return;
    }
    onChange({ ...state, activated: true, expiresAt: new Date(Date.now() + 365 * 86400000).toISOString() });
    setActivating(false);
  };

  if (state.activated) {
    return (
      <Stack gap="md">
        <Alert variant="light" color="green" title="License Activated" icon={<IconCircleCheck size={16} />}>
          License key <Code>{state.key.slice(0, 12)}...</Code> activated successfully.
        </Alert>
        <Paper withBorder p="md" radius="md">
          <Group>
            <ThemeIcon variant="light" color="blue" size="lg"><IconCalendar size={18} /></ThemeIcon>
            <div>
              <Text size="sm" fw={500}>Expires</Text>
              <Text size="sm" c="dimmed">{new Date(state.expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</Text>
            </div>
          </Group>
        </Paper>
        <Button variant="light" color="gray" onClick={() => onChange({ ...state, activated: false })}>
          Change License
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Enter your Ultralisk license key to activate the private deployment.
      </Text>
      <TextInput
        label="License Key"
        placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
        value={state.key}
        onChange={(e) => onChange({ ...state, key: e.currentTarget.value })}
        leftSection={<IconKey size={16} />}
        required
      />
      {error && (
        <Alert variant="light" color="red" title="Activation Failed" icon={<IconAlertCircle size={16} />}>
          {error}
        </Alert>
      )}
      <Group>
        <Button onClick={handleActivate} loading={activating}>Activate License</Button>
      </Group>
    </Stack>
  );
}
