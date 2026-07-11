import { apiFetch } from './client';
import type { PaginatedResponse, SingleResponse, BackendSession } from '@/types';

export async function getSessions() {
  return apiFetch<PaginatedResponse<BackendSession>>('/v1/admin/sessions');
}

export async function createSession(data: {
  name?: string;
  model_id?: string;
  messages?: { role: string; content: string }[];
}) {
  return apiFetch<SingleResponse<BackendSession>>('/v1/admin/sessions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateSession(id: string, data: Partial<BackendSession>) {
  return apiFetch<SingleResponse<BackendSession>>(`/v1/admin/sessions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteSession(id: string) {
  return apiFetch<void>(`/v1/admin/sessions/${id}`, { method: 'DELETE' });
}
