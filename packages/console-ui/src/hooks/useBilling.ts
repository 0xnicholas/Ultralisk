import { useQuery } from '@tanstack/react-query';
import { getBilling } from '@/api/billing';

export function useBilling() {
  return useQuery({
    queryKey: ['billing'],
    queryFn: () => getBilling().then((r) => r.data),
    refetchInterval: 60_000,
  });
}
