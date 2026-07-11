import { Title } from '@mantine/core';
import { SlackIntegration } from '@/components/settings/SlackIntegration';

export function IntegrationsPage() {
  return (
    <>
      <Title order={2} mb="md">Integrations</Title>
      <SlackIntegration />
    </>
  );
}
