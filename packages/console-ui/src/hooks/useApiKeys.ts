import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiKeys, createApiKey, revokeApiKey } from '@/api/apiKeys';
import type { CreateApiKeyRequest } from '@/types';

export function useApiKeys() {
  return useQuery({
    queryKey: ['api-keys'],
    queryFn: () => getApiKeys().then((r) => r.data),
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateApiKeyRequest) => createApiKey(data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}
