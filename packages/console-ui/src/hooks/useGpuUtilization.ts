import { useQuery } from '@tanstack/react-query';
import { getGpuUtilization } from '@/api/gpuUtilization';

export function useGpuUtilization() { return useQuery({ queryKey: ['gpu-utilization'], queryFn: () => getGpuUtilization().then((r) => r.data), refetchInterval: 15_000 }); }
