import { Paper, Text, Group, Badge, Button, Stack, Switch, Divider, Code } from '@mantine/core';
import { IconBrandSlack, IconPlugConnected, IconPlugOff } from '@tabler/icons-react';
import { useSlackConfig, useConnectSlack, useDisconnectSlack, useUpdateSlackConfig } from '@/hooks/useAlerts';

export function SlackIntegration() {
  const { data, isLoading } = useSlackConfig();
  const connectMutation = useConnectSlack();
  const disconnectMutation = useDisconnectSlack();
  const updateSlack = useUpdateSlackConfig();

  if (isLoading || !data) return null;

  return (
    <Paper withBorder p="lg" radius="md">
      <Group justify="space-between" mb="md">
        <Group><IconBrandSlack size={24} color="#4A154B" /><Text size="sm" fw={500}>Slack Integration</Text></Group>
        <Badge variant="light" color={data.connected ? 'green' : 'gray'} size="lg">
          {data.connected ? `Connected: ${data.workspace_name}` : 'Not connected'}
        </Badge>
      </Group>

      {data.connected ? (
        <>
          <Stack gap="sm" mb="md">
            <Text size="xs" fw={600}>Channels:</Text>
            <Group gap={4}>{data.channels.map((ch: string) => <Badge key={ch} variant="light" size="sm">{ch}</Badge>)}</Group>
          </Stack>

          <Text size="xs" fw={600} mb="xs">Notifications</Text>
          <Stack gap={4} mb="md">
            <Switch size="xs" label="Critical incidents" checked={data.notifications.critical} onChange={() => updateSlack.mutate({ notifications: { ...data.notifications, critical: !data.notifications.critical } })} />
            <Switch size="xs" label="Warning incidents" checked={data.notifications.warning} onChange={() => updateSlack.mutate({ notifications: { ...data.notifications, warning: !data.notifications.warning } })} />
            <Switch size="xs" label="AI analysis summary" checked={data.notifications.ai_summary} onChange={() => updateSlack.mutate({ notifications: { ...data.notifications, ai_summary: !data.notifications.ai_summary } })} />
            <Switch size="xs" label="Incident action confirmations" checked={data.notifications.incident_actions} onChange={() => updateSlack.mutate({ notifications: { ...data.notifications, incident_actions: !data.notifications.incident_actions } })} />
          </Stack>

          <Divider mb="md" />
          <Text size="xs" fw={600} mb="xs">Slash Commands</Text>
          <Stack gap={4} mb="md">
            {data.slash_commands.map((cmd: { command: string; description: string }, i: number) => (
              <Group key={i} gap="xs"><Code>{cmd.command}</Code><Text size="xs" c="dimmed">{cmd.description}</Text></Group>
            ))}
          </Stack>

          <Button color="red" variant="light" leftSection={<IconPlugOff size={16} />} onClick={() => disconnectMutation.mutate()} loading={disconnectMutation.isPending}>Disconnect Slack</Button>
        </>
      ) : (
        <Button leftSection={<IconPlugConnected size={16} />} variant="filled" color="violet" onClick={() => connectMutation.mutate()} loading={connectMutation.isPending}>Connect to Slack</Button>
      )}
    </Paper>
  );
}
