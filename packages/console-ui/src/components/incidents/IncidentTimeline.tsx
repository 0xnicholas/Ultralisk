import { Timeline, Text } from '@mantine/core';
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
