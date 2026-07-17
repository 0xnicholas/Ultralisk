import { Title, Paper, Text, Group, Stack, Badge, SimpleGrid, ThemeIcon, Progress, Switch } from '@mantine/core';
import { IconShieldCheck, IconFileCheck, IconLock, IconEye, IconCalendar } from '@tabler/icons-react';

const COMPLIANCE_STATUS = {
  soc2: { status: 'compliant' as const, lastAudit: '2026-06-15', validUntil: '2027-06-15' },
  iso27001: { status: 'in_progress' as const, lastAudit: null, validUntil: null },
  data_retention: { enabled: true, retentionDays: 90 },
  encryption: { atRest: true, inTransit: true },
  audit: { enabled: true, coverage: '100%' },
};

export function CompliancePage() {
  const badgeColor = (status: string) => {
    switch (status) {
      case 'compliant': return 'green';
      case 'in_progress': return 'yellow';
      case 'non_compliant': return 'red';
      default: return 'gray';
    }
  };

  return (
    <>
      <Title order={2} mb="md">Compliance</Title>

      <SimpleGrid cols={{ base: 1, md: 2 }} mb="md">
        <Paper withBorder p="lg" radius="md">
          <Group mb="sm">
            <ThemeIcon variant="light" color="green" size="lg"><IconShieldCheck size={20} /></ThemeIcon>
            <div>
              <Text size="sm" fw={500}>SOC 2</Text>
              <Badge variant="dot" size="sm" color={badgeColor(COMPLIANCE_STATUS.soc2.status)}>
                {COMPLIANCE_STATUS.soc2.status === 'compliant' ? 'Compliant' : 'In Progress'}
              </Badge>
            </div>
          </Group>
          {COMPLIANCE_STATUS.soc2.lastAudit && (
            <Stack gap={4}>
              <Text size="xs" c="dimmed">Last Audit: {COMPLIANCE_STATUS.soc2.lastAudit}</Text>
              <Text size="xs" c="dimmed">Valid Until: {COMPLIANCE_STATUS.soc2.validUntil}</Text>
            </Stack>
          )}
        </Paper>

        <Paper withBorder p="lg" radius="md">
          <Group mb="sm">
            <ThemeIcon variant="light" color="yellow" size="lg"><IconFileCheck size={20} /></ThemeIcon>
            <div>
              <Text size="sm" fw={500}>ISO 27001</Text>
              <Badge variant="dot" size="sm" color={badgeColor(COMPLIANCE_STATUS.iso27001.status)}>
                {COMPLIANCE_STATUS.iso27001.status === 'in_progress' ? 'In Progress' : 'Not Started'}
              </Badge>
            </div>
          </Group>
          <Progress value={35} size="sm" color="yellow" />
          <Text size="xs" c="dimmed" mt={4}>35% — Certification in progress</Text>
        </Paper>
      </SimpleGrid>

      <Paper withBorder p="lg" radius="md" mb="md">
        <Text size="sm" fw={500} mb="md">Data Security</Text>
        <Stack gap="md">
          <Group justify="space-between">
            <Group>
              <IconLock size={16} />
              <Text size="sm">Encryption at Rest</Text>
            </Group>
            <Badge variant="light" color={COMPLIANCE_STATUS.encryption.atRest ? 'green' : 'red'}>
              {COMPLIANCE_STATUS.encryption.atRest ? 'Enabled' : 'Disabled'}
            </Badge>
          </Group>
          <Group justify="space-between">
            <Group>
              <IconEye size={16} />
              <Text size="sm">Encryption in Transit</Text>
            </Group>
            <Badge variant="light" color={COMPLIANCE_STATUS.encryption.inTransit ? 'green' : 'red'}>
              {COMPLIANCE_STATUS.encryption.inTransit ? 'Enabled' : 'Disabled'}
            </Badge>
          </Group>
          <Group justify="space-between">
            <Group>
              <IconCalendar size={16} />
              <Text size="sm">Audit Log Coverage</Text>
            </Group>
            <Badge variant="light" color="green">{COMPLIANCE_STATUS.audit.coverage}</Badge>
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder p="lg" radius="md">
        <Text size="sm" fw={500} mb="md">Data Retention</Text>
        <Stack gap="md">
          <Switch
            label="Enable Data Retention Policy"
            description="Auto-delete audit logs and usage data after retention period"
            checked={COMPLIANCE_STATUS.data_retention.enabled}
            readOnly
          />
          <Group>
            <Text size="sm" c="dimmed">Retention Period</Text>
            <Text size="sm" fw={500}>{COMPLIANCE_STATUS.data_retention.retentionDays} days</Text>
          </Group>
        </Stack>
      </Paper>
    </>
  );
}
