import { useQuery } from '@tanstack/react-query';
import { getNodes, getNode, getClusterNode } from '@/api/nodes';

export function useNodes() { return useQuery({ queryKey: ['nodes'], queryFn: () => getNodes().then((r) => r.data) }); }
export function useNode(id: string) { return useQuery({ queryKey: ['nodes', id], queryFn: () => getNode(id).then((r) => r.data), enabled: !!id }); }
export function useClusterNode(clusterId: string, nodeId: string) { return useQuery({ queryKey: ['nodes', clusterId, nodeId], queryFn: () => getClusterNode(clusterId, nodeId).then((r) => r.data), enabled: !!clusterId && !!nodeId }); }
