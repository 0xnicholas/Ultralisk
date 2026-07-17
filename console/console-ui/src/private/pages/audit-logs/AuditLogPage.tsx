import { useState } from 'react';
import { Title, Paper, Table, Badge, Text, Group, Button, TextInput, Select, Pagination } from '@mantine/core';
import { IconDownload, IconSearch, IconRefresh } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { formatRelativeTime } from '@/utils/format';

interface AuditLog {
  id: string; created_at: string; user_email: string | null;
  action: string; resource_type: string; resource_id: string | null;
  details: Record<string, unknown> | null; ip_address: string | null;
}

export function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string | null>(null);
  const [resourceFilter, setResourceFilter] = useState<string | null>(null);

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', '50');
  if (search) params.set('q', search);
  if (actionFilter) params.set('action', actionFilter);
  if (resourceFilter) params.set('resource_type', resourceFilter);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, search, actionFilter, resourceFilter],
    queryFn: () => apiFetch<{ data: AuditLog[]; pagination: any }>(`/v1/admin/audit-logs?${params}`),
  });

  const handleExport = () => {
    const expParams = new URLSearchParams();
    if (search) expParams.set('q', search);
    if (actionFilter) expParams.set('action', actionFilter);
    if (resourceFilter) expParams.set('resource_type', resourceFilter);
    window.open(`/v1/admin/audit-logs/export?${expParams}`, '_blank');
  };

  const actionColor = (action: string) => {
    if (action.startsWith('delete')) return 'red';
    if (action.startsWith('post') || action.startsWith('create')) return 'green';
    if (action.startsWith('patch') || action.startsWith('update')) return 'yellow';
    return 'blue';
  };

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Audit Logs</Title>
        <Group>
          <Button variant="light" leftSection={<IconRefresh size={14} />} onClick={() => {}}>Refresh</Button>
          <Button variant="light" leftSection={<IconDownload size={14} />} onClick={handleExport}>Export CSV</Button>
        </Group>
      </Group>

      <Paper withBorder p="md" radius="md" mb="md">
        <Group gap="sm">
          <TextInput
            placeholder="Search logs..."
            leftSection={<IconSearch size={14} />}
            value={search}
            onChange={(e) => { setSearch(e.currentTarget.value); setPage(1); }}
            style={{ flex: 1 }}
          />
          <Select
            placeholder="All Actions"
            data={[
              { value: '', label: 'All Actions' },
              { value: 'post', label: 'Create' },
              { value: 'patch', label: 'Update' },
              { value: 'delete', label: 'Delete' },
            ]}
            value={actionFilter}
            onChange={(v) => { setActionFilter(v); setPage(1); }}
            clearable
            w={160}
          />
          <Select
            placeholder="All Resources"
            data={[
              { value: '', label: 'All Resources' },
              { value: 'api-keys', label: 'API Keys' },
              { value: 'endpoints', label: 'Endpoints' },
              { value: 'batch-jobs', label: 'Batch Jobs' },
              { value: 'deployments', label: 'Deployments' },
              { value: 'models', label: 'Models' },
              { value: 'registry', label: 'Model Registry' },
              { value: 'invitations', label: 'Invitations' },
            ]}
            value={resourceFilter}
            onChange={(v) => { setResourceFilter(v); setPage(1); }}
            clearable
            w={180}
          />
        </Group>
      </Paper>

      <Paper withBorder p="lg" radius="md">
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Timestamp</Table.Th>
              <Table.Th>User</Table.Th>
              <Table.Th>Action</Table.Th>
              <Table.Th>Resource</Table.Th>
              <Table.Th>Target</Table.Th>
              <Table.Th>IP</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading ? (
              <Table.Tr><Table.Td colSpan={6}><Text ta="center" py="xl">Loading...</Text></Table.Td></Table.Tr>
            ) : !data?.data?.length ? (
              <Table.Tr><Table.Td colSpan={6}><Text ta="center" py="xl" c="dimmed">No audit log entries found.</Text></Table.Td></Table.Tr>
            ) : (
              data.data.map((log: AuditLog) => (
                <Table.Tr key={log.id}>
                  <Table.Td><Text size="sm" ff="mono">{formatRelativeTime(log.created_at)}</Text></Table.Td>
                  <Table.Td><Text size="sm">{log.user_email || 'system'}</Text></Table.Td>
                  <Table.Td>
                    <Badge variant="light" size="sm" color={actionColor(log.action)}>
                      {log.action}
                    </Badge>
                  </Table.Td>
                  <Table.Td><Text size="sm">{log.resource_type}</Text></Table.Td>
                  <Table.Td><Text size="xs" ff="mono">{log.resource_id || '-'}</Text></Table.Td>
                  <Table.Td><Text size="xs" c="dimmed">{log.ip_address || '-'}</Text></Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>

        {data?.pagination && data.pagination.total_pages > 1 && (
          <Group justify="center" mt="md">
            <Pagination total={data.pagination.total_pages} value={page} onChange={setPage} />
          </Group>
        )}
      </Paper>
    </>
  );
}
