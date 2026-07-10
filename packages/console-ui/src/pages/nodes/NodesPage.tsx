import { Title, Paper } from '@mantine/core';
import { NodeList } from '@/components/nodes/NodeList';

export function NodesPage() {
  return (
    <>
      <Title order={2} mb="md">Nodes</Title>
      <Paper withBorder p="lg" radius="md">
        <NodeList />
      </Paper>
    </>
  );
}
