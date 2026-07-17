import { Group, ActionIcon, Text, Avatar, Menu, useMantineColorScheme } from '@mantine/core';
import { IconSun, IconMoon, IconLogout, IconSettings } from '@tabler/icons-react';
import { useAuth } from '@/stores/useAuth';
import { useNavigate } from 'react-router-dom';

export function TopBar() {
  const { user, logout } = useAuth();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const navigate = useNavigate();

  return (
    <Group h="100%" px="md" justify="space-between">
      <Group>
        <Text fw={700} size="lg">Ultralisk</Text>
      </Group>
      <Group>
        <ActionIcon
          variant="default"
          size="lg"
          onClick={toggleColorScheme}
          aria-label="Toggle color scheme"
        >
          {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
        </ActionIcon>
        {user && (
          <Menu shadow="md" width={200}>
            <Menu.Target>
              <Avatar color="violet" radius="xl" style={{ cursor: 'pointer' }}>
                {(user.displayName || user.email).charAt(0).toUpperCase()}
              </Avatar>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{user.email}</Menu.Label>
              <Menu.Item
                leftSection={<IconSettings size={14} />}
                onClick={() => navigate('/settings/profile')}
              >
                Settings
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                color="red"
                leftSection={<IconLogout size={14} />}
                onClick={logout}
              >
                Log out
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>
    </Group>
  );
}
