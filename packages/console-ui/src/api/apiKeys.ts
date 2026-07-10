import { apiFetch } from './client';
import type { PaginatedResponse, ApiKey, ApiKeyCreated, CreateApiKeyRequest } from '@/types';

export async function getApiKeys() {
  return apiFetch<PaginatedResponse<ApiKey>>('/v1/admin/api-keys');
}

export async function createApiKey(data: CreateApiKeyRequest) {
  return apiFetch<{ data: ApiKeyCreated }>('/v1/admin/api-keys', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function revokeApiKey(id: string) {
  return apiFetch<void>(`/v1/admin/api-keys/${id}`, { method: 'DELETE' });
}
