import { useState } from 'react';
import { Table, Badge, Text, Group, Skeleton, Tooltip, ActionIcon, Select } from '@mantine/core';
import { IconEye } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useIncidents } from '@/hooks/useIncidents';
import { formatRelativeTime } from '@/utils/format';
import type { Incident } from '@/types';

const severityColor: Record<string, string> = { critical: 'red', warning: 'yellow' };
const statusColor: Record<string, string> = { open: 'red', investigating: 'blue', mitigated: 'yellow', resolved: 'green', suppressed: 'gray' };

export function IncidentList() {
  const { data: incidents, isLoading } = useIncidents();
  const navigate = useNavigate();
  const [sevFilter, setSevFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const filtered = (incidents ?? []).filter((i: Incident) =>
    (!sevFilter || i.severity === sevFilter) && (!statusFilter || i.status === statusFilter)
  );

  const rows = filtered.map((inc: Incident) => (
    <Table.Tr key={inc.id}>
      <Table.Td><Badge variant="filled" size="sm" color={severityColor[inc.severity]}>{inc.severity}</Badge></Table.Td>
      <Table.Td><Text size="sm" fw={500}>{inc.title}</Text><Text size="xs" c="dimmed" lineClamp={1}>{inc.description}</Text></Table.Td>
      <Table.Td><Badge variant="light" size="sm" color={statusColor[inc.status]}>{inc.status}</Badge></Table.Td>
      <Table.Td><Text size="xs" c="dimmed">{inc.detection_type.replace(/_/g, ' ')}</Text></Table.Td>
      <Table.Td>
        {inc.ai_analysis?.root_causes?.[0]
          ? <Group gap={4}><Text size="xs">{inc.ai_analysis.root_causes[0].cause.slice(0, 40)}...</Text><Text size="xs" c="dimmed">({Math.round(inc.ai_analysis.root_causes[0].confidence * 100)}%)</Text></Group>
          : <Text size="xs" c="dimmed">Analyzing...</Text>}
      </Table.Td>
      <Table.Td><Text size="xs" c="dimmed">{formatRelativeTime(inc.triggered_at)}</Text></Table.Td>
      <Table.Td><Tooltip label="View details"><ActionIcon variant="light" size="sm" onClick={() => navigate(`/incidents/${inc.id}`)}><IconEye size={14} /></ActionIcon></Tooltip></Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Group mb="md" gap="sm">
        <Select size="xs" placeholder="All severities" clearable data={[{ value: 'critical', label: 'Critical' }, { value: 'warning', label: 'Warning' }]} value={sevFilter} onChange={setSevFilter} w={140} />
        <Select size="xs" placeholder="All statuses" clearable data={[{ value: 'open', label: 'Open' }, { value: 'investigating', label: 'Investigating' }, { value: 'mitigated', label: 'Mitigated' }, { value: 'resolved', label: 'Resolved' }, { value: 'suppressed', label: 'Suppressed' }]} value={statusFilter} onChange={setStatusFilter} w={160} />
      </Group>
      <Table striped highlightOnHover>
        <Table.Thead><Table.Tr><Table.Th>Severity</Table.Th><Table.Th>Title</Table.Th><Table.Th>Status</Table.Th><Table.Th>Type</Table.Th><Table.Th>Top Root Cause</Table.Th><Table.Th>Time</Table.Th><Table.Th></Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>{isLoading ? [1,2,3,4,5].map((i) => <Table.Tr key={i}>{[1,2,3,4,5,6,7].map((j) => <Table.Td key={j}><Skeleton height={20} /></Table.Td>)}</Table.Tr>) : rows}</Table.Tbody>
      </Table>
    </>
  );
}
