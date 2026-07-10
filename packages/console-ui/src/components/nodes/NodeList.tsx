import { Table, Badge, Text, ActionIcon, Skeleton, Tooltip } from '@mantine/core';
import { IconEye } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useNodes } from '@/hooks/useNodes';
import type { Node } from '@/types';

export function NodeList() {
  const { data: nodes, isLoading } = useNodes();
  const navigate = useNavigate();

  const rows = (nodes ?? []).map((n: Node) => (
    <Table.Tr key={n.id}>
      <Table.Td>
        <Text size="sm" fw={500}>{n.hostname}</Text>
        <Text size="xs" c="dimmed">{n.id}</Text>
      </Table.Td>
      <Table.Td><Badge variant="light" size="sm">{n.gpu_model}</Badge></Table.Td>
      <Table.Td><Text size="sm">{n.gpu_count}</Text></Table.Td>
      <Table.Td><Text size="xs" c="dimmed">{n.driver_version}</Text></Table.Td>
      <Table.Td><Text size="xs" c="dimmed">{n.cuda_version}</Text></Table.Td>
      <Table.Td>
        <Badge variant="dot" size="sm" color={n.status === 'online' ? 'green' : n.status === 'degraded' ? 'yellow' : 'red'}>
          {n.status}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Tooltip label="View GPUs">
          <ActionIcon variant="light" size="sm" onClick={() => navigate(`/nodes/${n.id}`)}>
            <IconEye size={14} />
          </ActionIcon>
        </Tooltip>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Table striped highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Hostname</Table.Th>
          <Table.Th>GPU</Table.Th>
          <Table.Th>Count</Table.Th>
          <Table.Th>Driver</Table.Th>
          <Table.Th>CUDA</Table.Th>
          <Table.Th>Status</Table.Th>
          <Table.Th></Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {isLoading
          ? [1, 2, 3].map((i) => (
              <Table.Tr key={i}>
                {[1, 2, 3, 4, 5, 6, 7].map((j) => (
                  <Table.Td key={j}><Skeleton height={20} /></Table.Td>
                ))}
              </Table.Tr>
            ))
          : rows}
      </Table.Tbody>
    </Table>
  );
}
