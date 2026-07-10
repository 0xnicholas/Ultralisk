import { NavLink, Stack, Text, ThemeIcon } from '@mantine/core';
import {
  IconLayoutDashboard, IconMessage, IconBox, IconKey,
  IconReceipt2, IconTerminal2, IconBoxMultiple,
  IconServer, IconCpu, IconRocket
} from '@tabler/icons-react';
import { useLocation, useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { section: 'Home', items: [
    { label: 'Dashboard', icon: IconLayoutDashboard, path: '/dashboard' },
  ]},
  { section: 'Develop', items: [
    { label: 'Playground', icon: IconMessage, path: '/playground' },
    { label: 'Models', icon: IconBox, path: '/models' },
    { label: 'API Keys', icon: IconKey, path: '/api-keys' },
  ]},
  { section: 'Inference', items: [
    { label: 'Endpoints', icon: IconTerminal2, path: '/endpoints' },
    { label: 'Batch Jobs', icon: IconBoxMultiple, path: '/batch-jobs' },
  ]},
  { section: 'Operations', items: [
    { label: 'Clusters', icon: IconServer, path: '/clusters' },
    { label: 'Nodes', icon: IconCpu, path: '/nodes' },
    { label: 'Deployments', icon: IconRocket, path: '/deployments' },
  ]},
  { section: 'Organization', items: [
    { label: 'Billing', icon: IconReceipt2, path: '/billing' },
  ]},
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Stack gap="xs" p="md">
      {NAV_ITEMS.map((group) => (
        <Stack key={group.section} gap={2}>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={4}>
            {group.section}
          </Text>
          {group.items.map((item) => (
            <NavLink
              key={item.path}
              label={item.label}
              leftSection={
                <ThemeIcon variant="light" size="sm">
                  <item.icon size={16} />
                </ThemeIcon>
              }
              active={location.pathname.startsWith(item.path)}
              onClick={() => navigate(item.path)}
              variant="light"
              styles={{ root: { borderRadius: 'var(--mantine-radius-md)' } }}
            />
          ))}
        </Stack>
      ))}
    </Stack>
  );
}
