import { useState } from 'react';
import {
  Modal,
  TextInput,
  Select,
  MultiSelect,
  NumberInput,
  Button,
  Group,
  Text,
  Alert,
  Code,
  CopyButton,
  ActionIcon,
} from '@mantine/core';
import { IconCheck, IconCopy, IconAlertCircle } from '@tabler/icons-react';
import { useCreateApiKey } from '@/hooks/useApiKeys';
import { useModels } from '@/hooks/useModels';

interface Props {
  opened: boolean;
  onClose: () => void;
}

export function CreateKeyModal({ opened, onClose }: Props) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<'admin' | 'developer' | 'readonly'>('developer');
  const [modelAllowlist, setModelAllowlist] = useState<string[]>([]);
  const [monthlyQuota, setMonthlyQuota] = useState<number | undefined>();
  const createMutation = useCreateApiKey();
  const { data: models } = useModels();
  const [secret, setSecret] = useState<string | null>(null);

  const modelOptions = (models ?? []).map((m) => ({
    value: m.id,
    label: m.display_name,
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await createMutation.mutateAsync({
      name,
      role,
      model_allowlist: modelAllowlist.length > 0 ? modelAllowlist : undefined,
      monthly_quota_usd: monthlyQuota,
    });
    setSecret(result.secret);
  };

  const handleClose = () => {
    setName('');
    setRole('developer');
    setModelAllowlist([]);
    setMonthlyQuota(undefined);
    setSecret(null);
    onClose();
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Create API Key" centered size="lg">
      {secret ? (
        <>
          <Alert icon={<IconAlertCircle size={16} />} color="yellow" variant="light" mb="md">
            <Text size="sm" fw={500}>
              Save this key now — you won't be able to see it again.
            </Text>
          </Alert>
          <Group mb="md">
            <Code block style={{ flex: 1 }}>
              {secret}
            </Code>
            <CopyButton value={secret} timeout={2000}>
              {({ copied, copy }) => (
                <ActionIcon
                  color={copied ? 'teal' : 'gray'}
                  variant="light"
                  onClick={copy}
                  size="lg"
                >
                  {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
                </ActionIcon>
              )}
            </CopyButton>
          </Group>
          <Button fullWidth onClick={handleClose}>
            Done
          </Button>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <TextInput
            label="Key Name"
            placeholder="Production"
            required
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            mb="sm"
          />
          <Select
            label="Role"
            data={[
              { value: 'admin', label: 'Admin — full access' },
              { value: 'developer', label: 'Developer — inference only' },
              { value: 'readonly', label: 'Read-only — view only' },
            ]}
            value={role}
            onChange={(v) => setRole(v as typeof role)}
            mb="sm"
          />
          <MultiSelect
            label="Model Allowlist (optional)"
            placeholder="All models available if empty"
            data={modelOptions}
            value={modelAllowlist}
            onChange={setModelAllowlist}
            searchable
            clearable
            mb="sm"
          />
          <NumberInput
            label="Monthly Quota (USD, optional)"
            placeholder="No limit"
            value={monthlyQuota ?? ''}
            onChange={(v) => setMonthlyQuota(typeof v === 'number' ? v : undefined)}
            min={0}
            mb="lg"
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" loading={createMutation.isPending} disabled={!name}>
              Create Key
            </Button>
          </Group>
        </form>
      )}
    </Modal>
  );
}
