import {
  Table,
  Badge,
  Group,
  ActionIcon,
  Text,
  CopyButton,
  Tooltip,
  Skeleton,
  Modal,
  Button,
} from '@mantine/core';
import { IconTrash, IconCopy, IconCheck } from '@tabler/icons-react';
import { useApiKeys, useRevokeApiKey } from '@/hooks/useApiKeys';
import { formatCurrency, formatRelativeTime } from '@/utils/format';
import type { ApiKey } from '@/types';
import { useState } from 'react';

export function KeyList() {
  const { data: keys, isLoading } = useApiKeys();
  const revokeMutation = useRevokeApiKey();
  const [revokeId, setRevokeId] = useState<string | null>(null);

  const handleRevoke = async () => {
    if (!revokeId) return;
    await revokeMutation.mutateAsync(revokeId);
    setRevokeId(null);
  };

  const rows = (keys ?? []).map((key: ApiKey) => (
    <Table.Tr key={key.id} style={{ opacity: key.status === 'revoked' ? 0.5 : 1 }}>
      <Table.Td>
        <Text size="sm" fw={500}>{key.name}</Text>
        <Group gap={4}>
          <Text size="xs" c="dimmed" ff="mono">{key.prefix}</Text>
          <CopyButton value={key.prefix} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Copied' : 'Copy prefix'}>
                <ActionIcon variant="subtle" size="xs" onClick={copy}>
                  {copied ? <IconCheck size={10} /> : <IconCopy size={10} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Group>
      </Table.Td>
      <Table.Td>
        <Badge
          size="sm"
          variant="light"
          color={key.role === 'admin' ? 'red' : key.role === 'developer' ? 'blue' : 'gray'}
        >
          {key.role}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Text size="sm">{formatCurrency(key.usage_this_month_usd)}</Text>
        {key.monthly_quota_usd && (
          <Text size="xs" c="dimmed">/ {formatCurrency(key.monthly_quota_usd)} limit</Text>
        )}
      </Table.Td>
      <Table.Td><Text size="sm">{formatRelativeTime(key.created_at)}</Text></Table.Td>
      <Table.Td>
        <Badge color={key.status === 'active' ? 'green' : 'gray'} variant="dot" size="sm">
          {key.status}
        </Badge>
      </Table.Td>
      <Table.Td>
        {key.status === 'active' && (
          <ActionIcon
            variant="light"
            color="red"
            size="sm"
            onClick={() => setRevokeId(key.id)}
            loading={revokeMutation.isPending && revokeId === key.id}
          >
            <IconTrash size={14} />
          </ActionIcon>
        )}
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Role</Table.Th>
            <Table.Th>Usage</Table.Th>
            <Table.Th>Created</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <Table.Tr key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <Table.Td key={j}><Skeleton height={20} /></Table.Td>
                  ))}
                </Table.Tr>
              ))
            : rows}
        </Table.Tbody>
      </Table>
      <Modal opened={!!revokeId} onClose={() => setRevokeId(null)} title="Revoke API Key" centered>
        <Text size="sm" mb="md">
          Are you sure you want to revoke this API key? This action cannot be undone. All requests
          using this key will fail immediately.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setRevokeId(null)}>Cancel</Button>
          <Button color="red" onClick={handleRevoke} loading={revokeMutation.isPending}>
            Revoke Key
          </Button>
        </Group>
      </Modal>
    </>
  );
}
