import { Title, Paper } from '@mantine/core';
import { DeploymentList } from '@/components/deployments/DeploymentList';

export function DeploymentsPage() { return (<><Title order={2} mb="md">Deployments</Title><Paper withBorder p="lg" radius="md"><DeploymentList /></Paper></>); }
