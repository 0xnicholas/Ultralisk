import { Title, Paper } from '@mantine/core';
import { IncidentList } from '@/components/incidents/IncidentList';

export function IncidentsPage() {
  return (
    <>
      <Title order={2} mb="md">Incidents</Title>
      <Paper withBorder p="lg" radius="md"><IncidentList /></Paper>
    </>
  );
}
