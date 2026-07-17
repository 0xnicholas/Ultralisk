import { useState } from 'react';
import { Container, Title, Text, Paper, Stepper, Group, Button, Center, Stack, Code, Alert } from '@mantine/core';
import { IconCheck, IconCircleCheck } from '@tabler/icons-react';
import { K8sStep } from '@/private/components/setup/K8sStep';
import { StorageStep } from '@/private/components/setup/StorageStep';
import { GpuStep } from '@/private/components/setup/GpuStep';
import { LicenseStep } from '@/private/components/setup/LicenseStep';

interface SetupState {
  k8s: { connected: boolean; clusterName: string; nodeCount: number };
  storage: { configured: boolean; type: 's3' | 'minio' | ''; endpoint: string };
  gpu: { detected: number; registered: number };
  license: { activated: boolean; key: string; expiresAt: string };
}

const INITIAL_STATE: SetupState = {
  k8s: { connected: false, clusterName: '', nodeCount: 0 },
  storage: { configured: false, type: '', endpoint: '' },
  gpu: { detected: 0, registered: 0 },
  license: { activated: false, key: '', expiresAt: '' },
};

export function SetupWizardPage() {
  const [active, setActive] = useState(0);
  const [state, setState] = useState<SetupState>(INITIAL_STATE);
  const [completed, setCompleted] = useState(false);

  const updateState = (partial: Partial<SetupState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  };

  const nextStep = () => setActive((a) => Math.min(a + 1, 3));
  const prevStep = () => setActive((a) => Math.max(a - 1, 0));

  const isStepComplete = (step: number) => {
    switch (step) {
      case 0: return state.k8s.connected;
      case 1: return state.storage.configured;
      case 2: return state.gpu.registered > 0;
      case 3: return state.license.activated;
      default: return false;
    }
  };

  const handleComplete = () => {
    setCompleted(true);
  };

  if (completed) {
    return (
      <Container size="sm" py="xl">
        <Center h={400}>
          <Stack align="center" gap="lg">
            <IconCircleCheck size={64} color="var(--mantine-color-green-6)" />
            <Title order={2}>Setup Complete</Title>
            <Text c="dimmed" ta="center">
              Ultralisk has been configured and is ready for use.
              You can now deploy models and create inference endpoints.
            </Text>
            <Alert variant="light" color="green" title="Next Steps">
              <Text size="sm">Go to the Dashboard to start using Ultralisk, or visit Models to deploy your first model.</Text>
            </Alert>
            <Group>
              <Button variant="light" component="a" href="/dashboard">Go to Dashboard</Button>
              <Button variant="subtle" component="a" href="/models">Browse Models</Button>
            </Group>
          </Stack>
        </Center>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Title order={2} mb="xs">Setup Wizard</Title>
      <Text c="dimmed" mb="lg">Configure your Ultralisk private deployment</Text>

      <Stepper active={active} onStepClick={setActive} mb="xl">
        <Stepper.Step label="Kubernetes" description="Connect cluster" completedIcon={<IconCheck size={14} />}>
          <Paper withBorder p="xl" radius="md">
            <K8sStep state={state.k8s} onChange={(k8s) => updateState({ k8s })} />
          </Paper>
        </Stepper.Step>

        <Stepper.Step label="Storage" description="Configure storage" completedIcon={<IconCheck size={14} />}>
          <Paper withBorder p="xl" radius="md">
            <StorageStep state={state.storage} onChange={(storage) => updateState({ storage })} />
          </Paper>
        </Stepper.Step>

        <Stepper.Step label="GPU Nodes" description="Register GPUs" completedIcon={<IconCheck size={14} />}>
          <Paper withBorder p="xl" radius="md">
            <GpuStep state={state.gpu} onChange={(gpu) => updateState({ gpu })} />
          </Paper>
        </Stepper.Step>

        <Stepper.Step label="License" description="Activate license" completedIcon={<IconCheck size={14} />}>
          <Paper withBorder p="xl" radius="md">
            <LicenseStep state={state.license} onChange={(license) => updateState({ license })} />
          </Paper>
        </Stepper.Step>
      </Stepper>

      <Group justify="space-between" mt="xl">
        <Button variant="subtle" disabled={active === 0} onClick={prevStep}>Back</Button>
        <Group>
          {active < 3 ? (
            <Button onClick={nextStep} disabled={!isStepComplete(active)}>
              {active === 3 ? 'Finish' : 'Next Step'}
            </Button>
          ) : (
            <Button onClick={handleComplete} disabled={!isStepComplete(3)}>
              Complete Setup
            </Button>
          )}
        </Group>
      </Group>
    </Container>
  );
}
