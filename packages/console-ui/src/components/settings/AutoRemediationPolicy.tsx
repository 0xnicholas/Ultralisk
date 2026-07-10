import { Paper, Text, Stack, Switch, Group, Badge, Checkbox, Divider } from '@mantine/core';
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
        const t = data.tiers[tier] as any;
        const labels = { tier1: 'Tier 1 — Automatic', tier2: 'Tier 2 — Semi-automatic (require approval)', tier3: 'Tier 3 — Manual (recommendation only)' };
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
