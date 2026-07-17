import { useState } from 'react';
import { Title, Paper, Text, Group, Button, Stack, TextInput, Textarea, Select, Switch, Alert, Code, Badge } from '@mantine/core';
import { IconCircleCheck, IconAlertCircle, IconBrandOpenSource, IconRefresh } from '@tabler/icons-react';

type SsoProvider = 'saml' | 'oidc';

const MOCK_SSO_CONFIG = {
  provider: 'saml' as SsoProvider,
  enabled: false,
  entity_id: 'https://ultralisk.io/saml/metadata',
  acs_url: 'https://ultralisk.io/saml/acs',
  idp_sso_url: '',
  idp_entity_id: '',
  idp_cert: '',
  jit_provisioning: true,
  default_role: 'developer',
};

export function SsoConfigPage() {
  const [config, setConfig] = useState(MOCK_SSO_CONFIG);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleTest = async () => {
    await new Promise((r) => setTimeout(r, 1000));
  };

  return (
    <>
      <Title order={2} mb="md">SSO / SAML Configuration</Title>

      <Paper withBorder p="lg" radius="md" mb="md">
        <Group justify="space-between" mb="md">
          <Text size="sm" fw={500}>Status</Text>
          <Badge variant="dot" color={config.enabled ? 'green' : 'gray'} size="lg">
            {config.enabled ? 'Connected' : 'Not Configured'}
          </Badge>
        </Group>

        <Switch
          label="Enable SSO Authentication"
          checked={config.enabled}
          onChange={(e) => setConfig({ ...config, enabled: e.currentTarget.checked })}
          mb="md"
        />
      </Paper>

      <Paper withBorder p="lg" radius="md" mb="md">
        <Text size="sm" fw={500} mb="md">Identity Provider Configuration</Text>
        <Stack gap="md">
          <Select
            label="Provider"
            data={[
              { value: 'saml', label: 'SAML 2.0' },
              { value: 'oidc', label: 'OpenID Connect' },
            ]}
            value={config.provider}
            onChange={(v) => setConfig({ ...config, provider: (v === 'oidc' ? 'oidc' : 'saml') as SsoProvider })}
          />
          <TextInput
            label="IdP SSO URL"
            placeholder="https://idp.example.com/saml/sso"
            value={config.idp_sso_url}
            onChange={(e) => setConfig({ ...config, idp_sso_url: e.currentTarget.value })}
          />
          <TextInput
            label="IdP Entity ID"
            placeholder="https://idp.example.com/entity-id"
            value={config.idp_entity_id}
            onChange={(e) => setConfig({ ...config, idp_entity_id: e.currentTarget.value })}
          />
          <Textarea
            label="IdP Certificate (x509)"
            placeholder="-----BEGIN CERTIFICATE-----..."
            value={config.idp_cert}
            onChange={(e) => setConfig({ ...config, idp_cert: e.currentTarget.value })}
            minRows={3}
          />
        </Stack>
      </Paper>

      <Paper withBorder p="lg" radius="md" mb="md">
        <Text size="sm" fw={500} mb="md">Service Provider Details</Text>
        <Stack gap="sm">
          <Group><Text size="sm" c="dimmed" w={120}>Entity ID</Text><Code>{config.entity_id}</Code></Group>
          <Group><Text size="sm" c="dimmed" w={120}>ACS URL</Text><Code>{config.acs_url}</Code></Group>
        </Stack>
      </Paper>

      <Paper withBorder p="lg" radius="md" mb="md">
        <Text size="sm" fw={500} mb="md">Provisioning</Text>
        <Stack gap="md">
          <Switch
            label="JIT (Just-In-Time) Provisioning"
            description="Auto-create users on first SSO login"
            checked={config.jit_provisioning}
            onChange={(e) => setConfig({ ...config, jit_provisioning: e.currentTarget.checked })}
          />
          <Select
            label="Default Role"
            data={[
              { value: 'admin', label: 'Admin' },
              { value: 'developer', label: 'Developer' },
              { value: 'readonly', label: 'Read-Only' },
            ]}
            value={config.default_role}
            onChange={(v) => setConfig({ ...config, default_role: v || 'developer' })}
          />
        </Stack>
      </Paper>

      {saved && (
        <Alert variant="light" color="green" title="Configuration Saved" icon={<IconCircleCheck size={16} />} mb="md">
          SSO configuration has been updated.
        </Alert>
      )}

      <Group justify="flex-end" gap="sm">
        <Button variant="light" leftSection={<IconRefresh size={14} />} onClick={handleTest} disabled={!config.enabled}>
          Test Connection
        </Button>
        <Button onClick={handleSave}>Save Configuration</Button>
      </Group>
    </>
  );
}
