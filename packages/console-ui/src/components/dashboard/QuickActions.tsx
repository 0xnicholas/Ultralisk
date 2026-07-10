import { SimpleGrid, Paper, Text, ThemeIcon, Group } from '@mantine/core';
import { IconKey, IconBook, IconBox, IconMessage } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';

const ACTIONS = [
  { label: 'Manage API Keys', icon: IconKey, path: '/api-keys', color: 'blue' },
  { label: 'API Reference', icon: IconBook, path: 'https://docs.ultralisk.com', color: 'violet', external: true },
  { label: 'Explore Models', icon: IconBox, path: '/models', color: 'green' },
  { label: 'Open Playground', icon: IconMessage, path: '/playground', color: 'orange' },
];

export function QuickActions() {
  const navigate = useNavigate();

  return (
    <>
      <Text size="sm" fw={500} mb="xs">Quick Actions</Text>
      <SimpleGrid cols={{ base: 2, sm: 4 }} mb="md">
        {ACTIONS.map((action) => (
          <Paper key={action.label} withBorder p="md" radius="md" style={{ cursor: 'pointer' }}
            onClick={() => action.external ? window.open(action.path, '_blank') : navigate(action.path)}>
            <Group>
              <ThemeIcon variant="light" color={action.color} size="lg"><action.icon size={20} /></ThemeIcon>
              <Text size="sm" fw={500}>{action.label}</Text>
            </Group>
          </Paper>
        ))}
      </SimpleGrid>
    </>
  );
}
