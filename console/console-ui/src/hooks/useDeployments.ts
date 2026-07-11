import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDeployments, getDeployment, scaleDeployment, rollbackDeployment } from '@/api/deployments';

export function useDeployments() { return useQuery({ queryKey: ['deployments'], queryFn: () => getDeployments().then((r) => r.data) }); }
export function useDeployment(id: string) { return useQuery({ queryKey: ['deployments', id], queryFn: () => getDeployment(id).then((r) => r.data), enabled: !!id }); }
export function useScaleDeployment() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, replicas }: { id: string; replicas: number }) => scaleDeployment(id, replicas), onSuccess: () => qc.invalidateQueries({ queryKey: ['deployments'] }) }); }
export function useRollbackDeployment() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => rollbackDeployment(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['deployments'] }) }); }
