import { Title, Paper, Text, Group, Stack, Badge, SimpleGrid, ThemeIcon, Progress, Code } from '@mantine/core';
import { IconKey, IconCalendar, IconUsers, IconCpu, IconBuilding } from '@tabler/icons-react';

const MOCK_LICENSE = {
  key: 'ULTR-XXXX-XXXX-XXXX-XXXX',
  status: 'active' as const,
  plan: 'Enterprise',
  issuedAt: '2026-01-01',
  expiresAt: '2027-01-01',
  maxGpus: 64,
  usedGpus: 22,
  maxUsers: 50,
  usedUsers: 8,
  supportLevel: 'premium' as const,
  supportExpiresAt: '2027-01-01',
};

export function LicensePage() {
  return (
    <>
      <Title order={2} mb="md">License & Support</Title>

      <SimpleGrid cols={{ base: 1, md: 2 }} mb="md">
        <Paper withBorder p="lg" radius="md">
          <Group mb="sm">
            <ThemeIcon variant="light" color="violet" size="lg"><IconKey size={20} /></ThemeIcon>
            <div>
              <Text size="sm" fw={500}>License Key</Text>
              <Code>{MOCK_LICENSE.key}</Code>
            </div>
          </Group>
          <Group gap="sm" mt="md">
            <Badge variant="dot" color="green" size="lg">{MOCK_LICENSE.plan}</Badge>
            <Badge variant="light" color={MOCK_LICENSE.status === 'active' ? 'green' : 'red'}>
              {MOCK_LICENSE.status}
            </Badge>
          </Group>
        </Paper>

        <Paper withBorder p="lg" radius="md">
          <Text size="sm" fw={500} mb="sm">Validity</Text>
          <Stack gap="sm">
            <Group>
              <IconCalendar size={16} />
              <Text size="sm" c="dimmed">Issued</Text>
              <Text size="sm">{MOCK_LICENSE.issuedAt}</Text>
            </Group>
            <Group>
              <IconCalendar size={16} />
              <Text size="sm" c="dimmed">Expires</Text>
              <Text size="sm">{MOCK_LICENSE.expiresAt}</Text>
            </Group>
          </Stack>
        </Paper>
      </SimpleGrid>

      <Paper withBorder p="lg" radius="md" mb="md">
        <Text size="sm" fw={500} mb="md">Usage</Text>
        <Stack gap="md">
          <div>
            <Group justify="space-between" mb={4}>
              <Group><IconCpu size={16} /><Text size="sm">GPU Nodes</Text></Group>
              <Text size="sm" fw={500}>{MOCK_LICENSE.usedGpus} / {MOCK_LICENSE.maxGpus}</Text>
            </Group>
            <Progress value={(MOCK_LICENSE.usedGpus / MOCK_LICENSE.maxGpus) * 100} size="sm" color={MOCK_LICENSE.usedGpus / MOCK_LICENSE.maxGpus > 0.8 ? 'red' : 'violet'} />
          </div>
          <div>
            <Group justify="space-between" mb={4}>
              <Group><IconUsers size={16} /><Text size="sm">Users</Text></Group>
              <Text size="sm" fw={500}>{MOCK_LICENSE.usedUsers} / {MOCK_LICENSE.maxUsers}</Text>
            </Group>
            <Progress value={(MOCK_LICENSE.usedUsers / MOCK_LICENSE.maxUsers) * 100} size="sm" color="blue" />
          </div>
        </Stack>
      </Paper>

      <Paper withBorder p="lg" radius="md">
        <Group mb="sm">
          <ThemeIcon variant="light" color="green" size="lg"><IconBuilding size={20} /></ThemeIcon>
          <div>
            <Text size="sm" fw={500}>Support</Text>
            <Badge variant="light" color="green" size="sm">{MOCK_LICENSE.supportLevel} Support</Badge>
          </div>
        </Group>
        <Text size="sm" c="dimmed">Support contract valid until {MOCK_LICENSE.supportExpiresAt}</Text>
      </Paper>
    </>
  );
}
