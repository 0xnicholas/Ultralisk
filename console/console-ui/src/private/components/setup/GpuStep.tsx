import { Button, Text, Group, Alert, Stack, SimpleGrid, Paper, Badge, ThemeIcon } from '@mantine/core';
import { IconCircleCheck, IconCpu, IconRefresh } from '@tabler/icons-react';
import { useState } from 'react';

interface GpuState {
  detected: number;
  registered: number;
}

export function GpuStep({ state, onChange }: { state: GpuState; onChange: (s: GpuState) => void }) {
  const [scanning, setScanning] = useState(false);

  const handleScan = async () => {
    setScanning(true);
    await new Promise((r) => setTimeout(r, 2000));
    onChange({ detected: 8, registered: 8 });
    setScanning(false);
  };

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Scan for available GPU nodes in the cluster. Detected GPUs will be registered for inference workloads.
      </Text>

      {state.detected > 0 ? (
        <>
          <Alert variant="light" color="green" title="GPUs Detected" icon={<IconCircleCheck size={16} />}>
            Found {state.detected} GPU{state.detected !== 1 ? 's' : ''} across the cluster.
          </Alert>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
            {Array.from({ length: state.detected }, (_, i) => (
              <Paper key={i} withBorder p="sm" radius="md">
                <Group>
                  <ThemeIcon variant="light" color="violet" size="lg"><IconCpu size={18} /></ThemeIcon>
                  <div>
                    <Text size="sm" fw={500}>GPU {i + 1}</Text>
                    <Badge size="xs" variant="light" color="green">Registered</Badge>
                  </div>
                </Group>
              </Paper>
            ))}
          </SimpleGrid>
          <Text size="xs" c="dimmed">{state.registered} of {state.detected} GPUs registered and ready.</Text>
        </>
      ) : (
        <Paper withBorder p="xl" radius="md" ta="center">
          <Stack align="center" gap="md">
            <ThemeIcon variant="light" color="violet" size="xl"><IconCpu size={28} /></ThemeIcon>
            <Text size="sm" c="dimmed">No GPUs scanned yet. Click the button below to detect GPU nodes.</Text>
            <Button onClick={handleScan} loading={scanning} leftSection={<IconRefresh size={16} />}>
              Scan for GPUs
            </Button>
          </Stack>
        </Paper>
      )}

      {state.detected > 0 && (
        <Button variant="light" color="gray" onClick={() => onChange({ detected: 0, registered: 0 })}>
          Re-scan
        </Button>
      )}
    </Stack>
  );
}
