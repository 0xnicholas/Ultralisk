import { useQuery } from '@tanstack/react-query';
import { getCostAnalytics } from '@/api/costAnalytics';
export function useCostAnalytics() { return useQuery({ queryKey: ['cost-analytics'], queryFn: () => getCostAnalytics().then((r) => r.data), refetchInterval: 30_000 }); }
