import { useQuery } from '@tanstack/react-query';
import { getModels, getModel } from '@/api/models';

export function useModels(filters?: Record<string, string>) {
  return useQuery({
    queryKey: ['models', filters],
    queryFn: () => getModels(filters).then((r) => r.data),
  });
}

export function useModel(id: string) {
  return useQuery({
    queryKey: ['models', id],
    queryFn: () => getModel(id).then((r) => r.data),
    enabled: !!id,
  });
}
