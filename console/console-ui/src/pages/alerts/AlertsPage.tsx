import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Title, Paper, Group, Badge, Text, ActionIcon, SegmentedControl, Stack, Skeleton, Button } from '@mantine/core';
import { IconEye, IconVolumeOff } from '@tabler/icons-react';
import { useAlerts, useSuppressAlert } from '@/hooks/useAlerts';
import { formatRelativeTime } from '@/utils/format';
import type { Alert } from '@/types';

const severityColor: Record<string, string> = { critical: 'red', warning: 'yellow', info: 'blue' };
const statusColor: Record<string, string> = { firing: 'red', resolved: 'green', suppressed: 'gray' };

const severityOptions = ['All', 'Critical', 'Warning', 'Info'];
const statusOptions = ['All', 'Firing', 'Resolved', 'Suppressed'];

function filterAlerts(alerts: Alert[], severity: string, status: string) {
  return alerts.filter((a) => {
    if (severity !== 'All' && a.severity !== severity.toLowerCase()) return false;
    if (status !== 'All' && a.status !== status.toLowerCase()) return false;
    return true;
  });
}

export function AlertsPage() {
  const navigate = useNavigate();
  const { data: alerts = [], isLoading } = useAlerts();
  const suppressMutation = useSuppressAlert();
  const [severity, setSeverity] = useState('All');
  const [status, setStatus] = useState('All');

  const filtered = useMemo(() => filterAlerts(alerts, severity, status), [alerts, severity, status]);
  const activeCount = alerts.filter((a) => a.status === 'firing').length;

  if (isLoading) return <Skeleton height={300} />;

  return (
    <>
      <Group justify="space-between" mb="md">
        <Group>
          <Title order={2}>Alerts</Title>
          {activeCount > 0 && <Badge variant="filled" color="red" size="lg">{activeCount} Active</Badge>}
        </Group>
      </Group>

      <Group mb="md">
        <SegmentedControl size="xs" data={severityOptions} value={severity} onChange={setSeverity} />
        <SegmentedControl size="xs" data={statusOptions} value={status} onChange={setStatus} />
      </Group>

      <Stack gap="sm">
        {filtered.map((alert) => (
          <Paper key={alert.id} withBorder p="md" radius="md">
            <Group justify="space-between" align="flex-start">
              <Group gap="sm" style={{ flex: 1 }}>
                <Badge variant="filled" color={severityColor[alert.severity]} size="sm">{alert.severity}</Badge>
                <div style={{ flex: 1 }}>
                  <Text size="sm" fw={500}>{alert.name}</Text>
                  <Text size="xs" c="dimmed" mt={2}>{alert.description}</Text>
                  <Group gap="xs" mt={4}>
                    <Badge variant="light" size="xs" color={statusColor[alert.status]}>{alert.status}</Badge>
                    <Text size="xs" c="dimmed">{formatRelativeTime(alert.fired_at)}</Text>
                    {alert.source_metric && <Badge variant="outline" size="xs">{alert.source_metric}</Badge>}
                  </Group>
                </div>
              </Group>
              <Group gap="xs">
                {alert.status === 'firing' && (
                  <Button size="xs" variant="light" color="gray" leftSection={<IconVolumeOff size={12} />}
                    loading={suppressMutation.isPending}
                    onClick={() => suppressMutation.mutate(alert.id)}>Suppress</Button>
                )}
                {alert.incident_id && (
                  <ActionIcon variant="subtle" color="blue" onClick={() => navigate(`/incidents/${alert.incident_id}`)} title="View Incident">
                    <IconEye size={16} />
                  </ActionIcon>
                )}
              </Group>
            </Group>
          </Paper>
        ))}
        {filtered.length === 0 && (
          <Paper withBorder p="xl" radius="md" ta="center">
            <Text c="dimmed" size="sm">No alerts match the current filters</Text>
          </Paper>
        )}
      </Stack>
    </>
  );
}
