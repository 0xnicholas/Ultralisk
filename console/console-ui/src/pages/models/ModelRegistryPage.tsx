import { useState } from 'react';
import { Title, Paper, Table, Badge, Text, Group, Button, Modal, TextInput, Select, Stack, Alert, Tooltip, ActionIcon, Code } from '@mantine/core';
import { IconCircleCheck, IconAlertCircle, IconClock, IconTrash, IconPlus, IconCloudDownload, IconRefresh } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { formatRelativeTime } from '@/utils/format';
import { isPrivate } from '@/utils/deployment';

interface RegistryEntry {
  id: string; name: string; source_type: string; source_path: string;
  status: 'importing' | 'ready' | 'failed'; model_id: string | null;
  error_message: string | null; created_at: string; ready_at: string | null;
}

export function ModelRegistryPage() {
  const queryClient = useQueryClient();
  const [importOpened, setImportOpened] = useState(false);

  const { data: entries, isLoading } = useQuery({
    queryKey: ['model-registry'],
    queryFn: () => apiFetch<{ data: RegistryEntry[] }>('/v1/admin/models/registry').then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/v1/admin/models/registry/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['model-registry'] }),
  });

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Model Registry</Title>
        <Group>
          <Button variant="light" leftSection={<IconRefresh size={14} />} onClick={() => queryClient.invalidateQueries({ queryKey: ['model-registry'] })}>
            Refresh
          </Button>
          {isPrivate() && (
            <Button leftSection={<IconPlus size={14} />} onClick={() => setImportOpened(true)}>
              Import Model
            </Button>
          )}
        </Group>
      </Group>

      <Paper withBorder p="lg" radius="md">
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Source</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Model ID</Table.Th>
              <Table.Th>Imported</Table.Th>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(!entries || entries.length === 0) ? (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text ta="center" c="dimmed" py="xl">
                    {isLoading ? 'Loading...' : 'No models in registry. Import a model to get started.'}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              entries.map((entry: RegistryEntry) => (
                <Table.Tr key={entry.id}>
                  <Table.Td><Text size="sm" fw={500}>{entry.name}</Text></Table.Td>
                  <Table.Td>
                    <Badge variant="light" size="sm">
                      {entry.source_type === 'hf' ? 'HuggingFace' : entry.source_type === 's3' ? 'S3' : entry.source_type === 'minio' ? 'MinIO' : 'Upload'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      variant="dot"
                      size="sm"
                      color={entry.status === 'ready' ? 'green' : entry.status === 'failed' ? 'red' : 'yellow'}
                      leftSection={entry.status === 'importing' ? <IconClock size={10} /> : entry.status === 'ready' ? <IconCircleCheck size={10} /> : <IconAlertCircle size={10} />}
                    >
                      {entry.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td><Code style={{ fontSize: 12 }}>{entry.model_id || '-'}</Code></Table.Td>
                  <Table.Td><Text size="sm">{formatRelativeTime(entry.created_at)}</Text></Table.Td>
                  <Table.Td>
                    <Tooltip label="Remove from registry">
                      <ActionIcon variant="light" color="red" size="sm" onClick={() => deleteMutation.mutate(entry.id)}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Paper>

      <ImportModelModal opened={importOpened} onClose={() => setImportOpened(false)} />
    </>
  );
}

function ImportModelModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [sourceType, setSourceType] = useState<string>('hf');
  const [sourcePath, setSourcePath] = useState('');

  const importMutation = useMutation({
    mutationFn: () =>
      apiFetch('/v1/admin/models/registry/import', {
        method: 'POST',
        body: JSON.stringify({ name, source_type: sourceType, source_path: sourcePath }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['model-registry'] });
      onClose();
      setName('');
      setSourcePath('');
    },
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Import Model" size="md" centered>
      <Stack gap="md">
        <TextInput
          label="Model Name"
          placeholder="e.g., Llama 3.1 8B Custom"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
        />
        <Select
          label="Source Type"
          data={[
            { value: 'hf', label: 'HuggingFace' },
            { value: 's3', label: 'Amazon S3' },
            { value: 'minio', label: 'MinIO' },
          ]}
          value={sourceType}
          onChange={(v) => setSourceType(v || 'hf')}
          required
        />
        <TextInput
          label="Source Path"
          placeholder={sourceType === 'hf' ? 'meta-llama/Llama-3.1-8B' : 's3://bucket/path'}
          value={sourcePath}
          onChange={(e) => setSourcePath(e.currentTarget.value)}
          required
        />
        {importMutation.isError && (
          <Alert variant="light" color="red" title="Import Failed" icon={<IconAlertCircle size={16} />}>
            {(importMutation.error as any)?.message || 'An error occurred'}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => importMutation.mutate()}
            loading={importMutation.isPending}
            disabled={!name || !sourcePath}
            leftSection={<IconCloudDownload size={14} />}
          >
            Start Import
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
