import { useQuery } from '@tanstack/react-query';
import { getClusters, getCluster } from '@/api/clusters';

export function useClusters() { return useQuery({ queryKey: ['clusters'], queryFn: () => getClusters().then((r) => r.data) }); }
export function useCluster(id: string) { return useQuery({ queryKey: ['clusters', id], queryFn: () => getCluster(id).then((r) => r.data), enabled: !!id }); }
