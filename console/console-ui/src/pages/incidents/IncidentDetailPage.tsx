import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Title, Paper, Text, Group, Button, Skeleton, Badge, SimpleGrid } from '@mantine/core';
import { IconArrowLeft, IconCheck, IconX, IconSearch } from '@tabler/icons-react';
import { useIncident, useUpdateIncident } from '@/hooks/useIncidents';
import { IncidentTimeline } from '@/components/incidents/IncidentTimeline';
import { AiAssistantPanel } from '@/components/incidents/AiAssistantPanel';
import { AreaChart } from '@mantine/charts';
import { formatRelativeTime } from '@/utils/format';

const severityColor: Record<string, string> = { critical: 'red', warning: 'yellow' };
const statusColor: Record<string, string> = { open: 'red', investigating: 'blue', mitigated: 'yellow', resolved: 'green', suppressed: 'gray' };

export function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>(); const navigate = useNavigate();
  const { data: inc, isLoading } = useIncident(id ?? '');
  const updateMutation = useUpdateIncident();

  // Mock time-series data for center panel. Generated once on mount so it
  // doesn't churn between renders (real chart data will come from a query).
  // Must be before any early return to satisfy rules-of-hooks.
  const [mockMetrics] = useState(() =>
    Array.from({ length: 20 }, (_, i) => ({
      time: new Date(Date.now() - (19 - i) * 120000).toLocaleTimeString(),
      'GPU Util': Math.floor(Math.random() * 30 + 20 + (i > 10 ? 40 : 0)),
      'Memory GB': Math.floor(Math.random() * 20 + 50 + (i > 12 ? 15 : 0)),
    }))
  );

  if (isLoading) return <Skeleton height={500} />;
  if (!inc) return <Text c="red">Incident not found</Text>;

  const statusActions = [
    { label: 'Investigating', status: 'investigating' as const, color: 'blue', icon: IconSearch },
    { label: 'Mitigated', status: 'mitigated' as const, color: 'yellow', icon: IconCheck },
    { label: 'Resolved', status: 'resolved' as const, color: 'green', icon: IconCheck },
    { label: 'Suppress', status: 'suppressed' as const, color: 'gray', icon: IconX },
  ];

  return (
    <>
      <Group mb="md"><Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/incidents')}>Back</Button></Group>

      {/* Header */}
      <Group justify="space-between" mb="md">
        <Group>
          <Badge variant="filled" color={severityColor[inc.severity]} size="lg">{inc.severity}</Badge>
          <div><Title order={2}>{inc.title}</Title><Text size="sm" c="dimmed">{inc.description}</Text></div>
        </Group>
        <Badge variant="light" size="lg" color={statusColor[inc.status]}>{inc.status}</Badge>
      </Group>

      {/* Status action buttons */}
      <Group mb="md" gap="xs">
        {statusActions.map((a) => (
          <Button key={a.status} size="xs" variant="light" color={a.color} leftSection={<a.icon size={12} />}
            onClick={() => updateMutation.mutate({ id: inc.id, data: { status: a.status } })}
            loading={updateMutation.isPending} disabled={inc.status === a.status}>{a.label}</Button>
        ))}
      </Group>

      {/* 3-column layout */}
      <SimpleGrid cols={{ base: 1, md: 3 }} style={{ alignItems: 'start' }}>
        {/* Left: Timeline */}
        <Paper withBorder p="md" radius="md">
          <Text size="sm" fw={500} mb="sm">Timeline</Text>
          <IncidentTimeline actions={inc.action_log} />
        </Paper>

        {/* Center: Metrics */}
        <Paper withBorder p="md" radius="md">
          <Text size="sm" fw={500} mb="sm">Metrics</Text>
          <AreaChart h={200} data={mockMetrics} dataKey="time"
            series={[{ name: 'GPU Util', color: 'violet.6' }, { name: 'Memory GB', color: 'blue.6' }]}
            curveType="natural" tickLine="none" gridAxis="y" withLegend />
          <SimpleGrid cols={2} mt="md">
            <Paper withBorder p="sm" radius="sm">
              <Text size="xs" c="dimmed">Detected</Text>
              <Text size="sm" fw={500}>{formatRelativeTime(inc.triggered_at)}</Text>
            </Paper>
            <Paper withBorder p="sm" radius="sm">
              <Text size="xs" c="dimmed">Affected</Text>
              <Text size="xs" fw={500}>{inc.affected_entities.node_id ?? inc.affected_entities.cluster_id ?? inc.affected_entities.endpoint_id ?? '-'}</Text>
            </Paper>
          </SimpleGrid>
        </Paper>

        {/* Right: AI Panel */}
        <AiAssistantPanel incident={inc} />
      </SimpleGrid>
    </>
  );
}
