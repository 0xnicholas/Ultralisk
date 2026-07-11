import { Title } from '@mantine/core';
import { AutoRemediationPolicy } from '@/components/settings/AutoRemediationPolicy';

export function OperationsSettingsPage() {
  return (
    <>
      <Title order={2} mb="md">Operations Settings</Title>
      <AutoRemediationPolicy />
    </>
  );
}
