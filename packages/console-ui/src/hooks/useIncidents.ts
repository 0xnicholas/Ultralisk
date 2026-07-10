import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Incident } from '@/types';
import { getIncidents, getIncident, updateIncident, addIncidentAction } from '@/api/incidents';
export function useIncidents() { return useQuery({ queryKey: ['incidents'], queryFn: () => getIncidents().then((r) => r.data), refetchInterval: 15_000 }); }
export function useIncident(id: string) { return useQuery({ queryKey: ['incidents', id], queryFn: () => getIncident(id).then((r) => r.data), enabled: !!id }); }
export function useUpdateIncident() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, data }: { id: string; data: Partial<Incident> }) => updateIncident(id, data).then((r) => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['incidents'] }) }); }
