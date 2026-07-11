import { Title, Paper, Text, Group, Badge, Table, Button, Stack, SimpleGrid, Skeleton } from '@mantine/core';
import { IconUserPlus, IconBuilding } from '@tabler/icons-react';
import { useOrganization } from '@/hooks/useOrganization';
import { formatRelativeTime } from '@/utils/format';

const roleColors: Record<string, string> = { admin: 'red', developer: 'blue', readonly: 'gray' };

export function OrganizationPage() {
  const { data: org, isLoading } = useOrganization();
  if (isLoading) return <Skeleton height={400} />;
  if (!org) return null;

  return (
    <>
      <Title order={2} mb="md">Organization</Title>

      <SimpleGrid cols={{ base: 1, md: 2 }} mb="md">
        <Paper withBorder p="lg" radius="md">
          <Group mb="sm"><IconBuilding size={20} /><Text size="sm" fw={500}>General</Text></Group>
          <Stack gap="xs">
            <Group><Text size="sm" fw={500}>Name:</Text><Text size="sm">{org.name}</Text></Group>
            <Group><Text size="sm" fw={500}>Plan:</Text><Badge variant="light" color="violet">{org.plan}</Badge></Group>
            <Group><Text size="sm" fw={500}>Billing Email:</Text><Text size="sm">{org.billing_email}</Text></Group>
            <Group><Text size="sm" fw={500}>Created:</Text><Text size="sm">{new Date(org.created_at).toLocaleDateString()}</Text></Group>
          </Stack>
        </Paper>

        <Paper withBorder p="lg" radius="md">
          <Text size="sm" fw={500} mb="sm">Projects ({org.projects.length})</Text>
          <Table striped>
            <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Members</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{org.projects.map((p) => (
              <Table.Tr key={p.id}><Table.Td><Text size="sm">{p.name}</Text></Table.Td><Table.Td><Badge variant="light" size="sm">{p.member_count}</Badge></Table.Td></Table.Tr>
            ))}</Table.Tbody>
          </Table>
        </Paper>
      </SimpleGrid>

      <Paper withBorder p="lg" radius="md">
        <Group justify="space-between" mb="md">
          <Text size="sm" fw={500}>Members ({org.members.length})</Text>
          <Button size="xs" variant="light" leftSection={<IconUserPlus size={14} />}>Invite Member</Button>
        </Group>
        <Table striped highlightOnHover>
          <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Email</Table.Th><Table.Th>Role</Table.Th><Table.Th>Joined</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>{org.members.map((m) => (
            <Table.Tr key={m.id}>
              <Table.Td><Text size="sm" fw={500}>{m.name}</Text></Table.Td>
              <Table.Td><Text size="sm">{m.email}</Text></Table.Td>
              <Table.Td><Badge variant="light" color={roleColors[m.role]} size="sm">{m.role}</Badge></Table.Td>
              <Table.Td><Text size="sm">{formatRelativeTime(m.joined_at)}</Text></Table.Td>
            </Table.Tr>
          ))}</Table.Tbody>
        </Table>
      </Paper>
    </>
  );
}
