# Task for worker

Implement Phase 2d Tasks 3+4+5: Incidents List, Incident Detail, AI Panel, Auto-Remediation, Slack Settings

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

Tasks 1-2 done. API stubs and types are ready. Create all UI pages.

## TASK 3: Incidents List Page

### Step 3.1: Create IncidentList component

Create `packages/console-ui/src/components/incidents/IncidentList.tsx`:
```typescript
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
```

### Step 3.2: Create IncidentsPage

Overwrite `packages/console-ui/src/pages/incidents/IncidentsPage.tsx`:
```typescript
import { Title, Paper } from '@mantine/core';
import { IncidentList } from '@/components/incidents/IncidentList';

export function IncidentsPage() {
  return (
    <>
      <Title order={2} mb="md">Incidents</Title>
      <Paper withBorder p="lg" radius="md"><IncidentList /></Paper>
    </>
  );
}
```

### Step 3.3: Commit
```bash
git add packages/console-ui/src && git commit -m "feat: add Incidents list page with filters"
```

## TASK 4: Incident Detail + AI Chat Panel

### Step 4.1: Create IncidentTimeline

Create `packages/console-ui/src/components/incidents/IncidentTimeline.tsx`:
```typescript
import { Timeline, Text, Badge, Group } from '@mantine/core';
import { IconAlertCircle, IconSearch, IconCheck, IconX } from '@tabler/icons-react';
import { formatRelativeTime } from '@/utils/format';
import type { IncidentActionLog } from '@/types';

const actionIcon = (action: string) => {
  if (action.includes('auto-created') || action.includes('created')) return IconAlertCircle;
  if (action.includes('analysis') || action.includes('investigat')) return IconSearch;
  if (action.includes('resolved') || action.includes('mitigated') || action.includes('completed')) return IconCheck;
  return IconX;
};

export function IncidentTimeline({ actions }: { actions: IncidentActionLog[] }) {
  const sorted = [...actions].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return (
    <Timeline active={sorted.length - 1} bulletSize={24} lineWidth={2}>
      {sorted.map((a, i) => {
        const Icon = actionIcon(a.action);
        return (
          <Timeline.Item key={i} bullet={<Icon size={12} />} title={a.action}>
            <Text size="xs" c="dimmed">{formatRelativeTime(a.timestamp)}</Text>
            {a.result && <Text size="xs" mt={4}>{a.result}</Text>}
            <Text size="xs" c="dimmed" fs="italic">{a.user_id}</Text>
          </Timeline.Item>
        );
      })}
    </Timeline>
  );
}
```

### Step 4.2: Create AiAssistantPanel

Create `packages/console-ui/src/components/incidents/AiAssistantPanel.tsx`:
```typescript
import { useState } from 'react';
import { Paper, Text, Group, Badge, Stack, Progress, Textarea, Button, Timeline, ScrollArea } from '@mantine/core';
import { IconRobot, IconSend } from '@tabler/icons-react';
import type { Incident } from '@/types';

export function AiAssistantPanel({ incident }: { incident: Incident }) {
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState(incident.conversation_history ?? []);
  const analysis = incident.ai_analysis;

  const handleAsk = () => {
    if (!question.trim()) return;
    const newEntry = { timestamp: new Date().toISOString(), role: 'user' as const, content: question };
    setChat([...chat, newEntry]);
    // Mock: AI would respond via API
    setTimeout(() => {
      setChat((prev) => [...prev, { timestamp: new Date().toISOString(), role: 'assistant' as const, content: 'Based on the metrics, the root cause appears to be related to the OOM kill pattern. I recommend checking the vLLM worker logs for exit code 137 (SIGKILL).' }]);
    }, 500);
    setQuestion('');
  };

  return (
    <Paper withBorder p="md" radius="md" h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
      <Group mb="md"><IconRobot size={18} color="var(--mantine-color-violet-6)" /><Text size="sm" fw={500}>AI Assistant</Text><Badge size="xs" variant="light">{analysis.model_used}</Badge></Group>

      {/* Root Causes */}
      <Text size="xs" fw={600} mb="xs">Root Causes</Text>
      <Stack gap="sm" mb="md">
        {analysis.root_causes.map((rc, i) => (
          <Paper key={i} withBorder p="sm" radius="sm" bg="var(--mantine-color-dark-7)">
            <Group justify="space-between" mb={4}>
              <Text size="xs" fw={600}>#{i + 1} {rc.cause}</Text>
              <Text size="xs" fw={500} c={rc.confidence > 0.8 ? 'red' : rc.confidence > 0.5 ? 'yellow' : 'gray'}>{Math.round(rc.confidence * 100)}%</Text>
            </Group>
            <Progress value={rc.confidence * 100} size="xs" color={rc.confidence > 0.8 ? 'red' : rc.confidence > 0.5 ? 'yellow' : 'gray'} mb={4} />
            <Text size="xs" c="dimmed">{rc.evidence}</Text>
          </Paper>
        ))}
      </Stack>

      {/* Recommendations */}
      <Text size="xs" fw={600} mb="xs">Recommendations</Text>
      <Stack gap={4} mb="md">
        {analysis.recommendations.map((r, i) => (
          <Group key={i} gap="xs">
            <Badge size="xs" color={r.risk === 'low' ? 'green' : r.risk === 'medium' ? 'yellow' : 'red'} variant="light">{r.risk}</Badge>
            <Text size="xs">{r.action}</Text>
          </Group>
        ))}
      </Stack>

      {/* Chat */}
      <Text size="xs" fw={600} mb="xs">Conversation</Text>
      <ScrollArea h={180} mb="sm">
        <Stack gap={4}>
          {chat.map((c, i) => (
            <Paper key={i} p="xs" radius="sm" bg={c.role === 'user' ? 'var(--mantine-color-violet-light)' : undefined}>
              <Text size="xs" fw={c.role === 'user' ? 500 : 400}>{c.content}</Text>
              <Text size="xs" c="dimmed" fs="italic">{c.role}</Text>
            </Paper>
          ))}
        </Stack>
      </ScrollArea>

      <Group gap="xs">
        <Textarea value={question} onChange={(e) => setQuestion(e.currentTarget.value)} placeholder="Ask about this incident..." minRows={1} maxRows={3} autosize style={{ flex: 1 }} size="xs" />
        <Button size="sm" variant="light" onClick={handleAsk} disabled={!question.trim()}><IconSend size={14} /></Button>
      </Group>
    </Paper>
  );
}
```

### Step 4.3: Create IncidentDetailPage (overwrite placeholder)

Write `packages/console-ui/src/pages/incidents/IncidentDetailPage.tsx`:
```typescript
import { useParams, useNavigate } from 'react-router-dom';
import { Title, Paper, Text, Group, Button, Skeleton, Badge, SimpleGrid, Stack } from '@mantine/core';
import { IconArrowLeft, IconAlertTriangle, IconCheck, IconX, IconSearch } from '@tabler/icons-react';
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

  if (isLoading) return <Skeleton height={500} />;
  if (!inc) return <Text c="red">Incident not found</Text>;

  // Mock time-series data for center panel
  const mockMetrics = Array.from({ length: 20 }, (_, i) => ({
    time: new Date(Date.now() - (19 - i) * 120000).toLocaleTimeString(),
    'GPU Util': Math.floor(Math.random() * 30 + 20 + (i > 10 ? 40 : 0)),
    'Memory GB': Math.floor(Math.random() * 20 + 50 + (i > 12 ? 15 : 0)),
  }));

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
```

### Step 4.4: Commit
```bash
git add packages/console-ui/src && git commit -m "feat: add Incident detail page with 3-column layout, timeline, metrics, and AI chat panel"
```

## TASK 5: Auto-Remediation + Slack Settings

### Step 5.1: Create AutoRemediationPolicy

Create `packages/console-ui/src/components/settings/AutoRemediationPolicy.tsx`:
```typescript
import { Paper, Text, Stack, Switch, Group, Badge, Checkbox, NumberInput, Button, Divider } from '@mantine/core';
import { useAutoRemediation, useUpdateAutoRemediation } from '@/hooks/useAlerts';

export function AutoRemediationPolicy() {
  const { data, isLoading } = useAutoRemediation();
  const updateMutation = useUpdateAutoRemediation();

  if (isLoading || !data) return null;

  const toggleOperation = (tier: string, opId: string) => {
    const tiers = { ...data.tiers };
    const t = tiers[tier as keyof typeof tiers] as any;
    t.operations = t.operations.map((op: any) => op.id === opId ? { ...op, enabled: !op.enabled } : op);
    updateMutation.mutate({ ...data, tiers });
  };

  return (
    <Paper withBorder p="lg" radius="md">
      <Group justify="space-between" mb="md">
        <Text size="sm" fw={500}>Auto-Remediation Policy</Text>
        <Switch checked={data.enabled} label="Enabled"
          onChange={() => updateMutation.mutate({ ...data, enabled: !data.enabled })} />
      </Group>

      {(['tier1', 'tier2', 'tier3'] as const).map((tier) => {
        const t = data.tiers[tier];
        const labels = { tier1: 'Tier 1 — Automatic', tier2: 'Tier 2 — Semi-automatic (require approval)', tier3: 'Tier 3 — Manual (recommendation only)' };
        const colors = { tier1: 'green', tier2: 'yellow', tier3: 'orange' };
        return (
          <div key={tier}>
            <Group justify="space-between" mb={4}>
              <Text size="sm" fw={600}>{labels[tier]}</Text>
              <Switch size="xs" checked={t.enabled} onChange={() => {
                const updated = { ...data, tiers: { ...data.tiers, [tier]: { ...t, enabled: !t.enabled } } };
                updateMutation.mutate(updated);
              }} />
            </Group>
            <Stack gap={4} mb="md" ml="md">
              {t.operations.map((op: any) => (
                <Checkbox key={op.id} size="xs" label={op.label} checked={op.enabled}
                  onChange={() => toggleOperation(tier, op.id)} disabled={!t.enabled} />
              ))}
              {tier === 'tier2' && t.approval_channels && (
                <Group gap={4} mt={4}>
                  <Text size="xs" c="dimmed">Approval channels:</Text>
                  {(t.approval_channels as string[]).map((ch: string) => <Badge key={ch} size="xs" variant="light">{ch === 'web' ? '🌐' : ch === 'slack' ? '💬' : '📧'} {ch}</Badge>)}
                </Group>
              )}
            </Stack>
            {tier !== 'tier3' && <Divider mb="sm" />}
          </div>
        );
      })}

      <Divider mb="md" />
      <Group>
        <Text size="sm">Auto-suppression:</Text>
        <Switch checked={data.auto_suppression.enabled} label={`${data.auto_suppression.window_hours}h window`} />
      </Group>
    </Paper>
  );
}
```

### Step 5.2: Create SlackIntegration

Create `packages/console-ui/src/components/settings/SlackIntegration.tsx`:
```typescript
import { Paper, Text, Group, Badge, Button, Stack, Switch, Divider, Code } from '@mantine/core';
import { IconBrandSlack, IconPlugConnected, IconPlugOff } from '@tabler/icons-react';
import { useSlackConfig, useConnectSlack, useDisconnectSlack } from '@/hooks/useAlerts';

export function SlackIntegration() {
  const { data, isLoading } = useSlackConfig();
  const connectMutation = useConnectSlack();
  const disconnectMutation = useDisconnectSlack();

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
            <Switch size="xs" label="Critical incidents" checked={data.notifications.critical} />
            <Switch size="xs" label="Warning incidents" checked={data.notifications.warning} />
            <Switch size="xs" label="AI analysis summary" checked={data.notifications.ai_summary} />
            <Switch size="xs" label="Incident action confirmations" checked={data.notifications.incident_actions} />
          </Stack>

          <Divider mb="md" />
          <Text size="xs" fw={600} mb="xs">Slash Commands</Text>
          <Stack gap={4} mb="md">
            {data.slash_commands.map((cmd: any, i: number) => (
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
```

### Step 5.3: Create settings pages

Overwrite `packages/console-ui/src/pages/settings/OperationsSettingsPage.tsx`:
```typescript
import { Title } from '@mantine/core';
import { AutoRemediationPolicy } from '@/components/settings/AutoRemediationPolicy';

export function OperationsSettingsPage() {
  return (
    <>
      <Title order={2} mb="md">Operations Settings</Title>
      <AutoRemediationPolicy />
    </>
  );
}
```

Overwrite `packages/console-ui/src/pages/settings/IntegrationsPage.tsx`:
```typescript
import { Title } from '@mantine/core';
import { SlackIntegration } from '@/components/settings/SlackIntegration';

export function IntegrationsPage() {
  return (
    <>
      <Title order={2} mb="md">Integrations</Title>
      <SlackIntegration />
    </>
  );
}
```

### Step 5.4: Verify and commit
```bash
cd packages/console-ui && pnpm typecheck
git add packages/console-ui/src
git commit -m "feat: add Incidents list/detail with AI panel, Auto-Remediation, and Slack integration pages"
```

## Acceptance Contract
Acceptance level: checked
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope

Required evidence: changed-files, tests-added, commands-run, residual-risks, no-staged-files

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```