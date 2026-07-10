import { useQuery } from '@tanstack/react-query';
import { getUsage } from '@/api/usage';

export function useUsage(range = 'today') {
  return useQuery({
    queryKey: ['usage', range],
    queryFn: () => getUsage(range).then((r) => r.data),
    refetchInterval: 30_000,
  });
}
