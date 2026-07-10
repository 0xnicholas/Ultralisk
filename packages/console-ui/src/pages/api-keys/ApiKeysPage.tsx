import { useState } from 'react';
import { Title, Button, Group, Paper } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { KeyList } from '@/components/api-keys/KeyList';
import { CreateKeyModal } from '@/components/api-keys/CreateKeyModal';

export function ApiKeysPage() {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>API Keys</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateOpen(true)}>
          Create API Key
        </Button>
      </Group>
      <Paper withBorder p="lg" radius="md">
        <KeyList />
      </Paper>
      <CreateKeyModal opened={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}
