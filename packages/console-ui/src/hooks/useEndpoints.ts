import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEndpoints, getEndpoint, createEndpoint, deleteEndpoint } from '@/api/endpoints';
import type { CreateEndpointRequest } from '@/types';

export function useEndpoints() { return useQuery({ queryKey: ['endpoints'], queryFn: () => getEndpoints().then((r) => r.data) }); }
export function useEndpoint(id: string) { return useQuery({ queryKey: ['endpoints', id], queryFn: () => getEndpoint(id).then((r) => r.data), enabled: !!id }); }
export function useCreateEndpoint() { const qc = useQueryClient(); return useMutation({ mutationFn: (d: CreateEndpointRequest) => createEndpoint(d).then((r) => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['endpoints'] }) }); }
export function useDeleteEndpoint() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => deleteEndpoint(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['endpoints'] }) }); }
