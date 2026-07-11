import {
  Title,
  Paper,
  TextInput,
  Button,
  Group,
  SegmentedControl,
  useMantineColorScheme,
} from '@mantine/core';
import { useAuth } from '@/stores/AuthContext';
import { useState } from 'react';

export function ProfilePage() {
  const { user } = useAuth();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [name, setName] = useState(user?.name ?? '');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <>
      <Title order={2} mb="md">
        Profile
      </Title>
      <Paper withBorder p="lg" radius="md" mb="md">
        <Title order={4} mb="sm">
          Personal Information
        </Title>
        <TextInput label="Email" value={user?.email ?? ''} disabled mb="sm" />
        <TextInput
          label="Name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          mb="md"
        />
        <Group>
          <Button onClick={handleSave}>{saved ? 'Saved!' : 'Save Changes'}</Button>
        </Group>
      </Paper>
      <Paper withBorder p="lg" radius="md">
        <Title order={4} mb="sm">
          Appearance
        </Title>
        <SegmentedControl
          value={colorScheme}
          onChange={(v) => setColorScheme(v as 'light' | 'dark' | 'auto')}
          data={[
            { label: 'Light', value: 'light' },
            { label: 'Dark', value: 'dark' },
            { label: 'System', value: 'auto' },
          ]}
        />
      </Paper>
    </>
  );
}
