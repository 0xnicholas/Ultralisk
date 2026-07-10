import { apiFetch } from './client';
import type { PaginatedResponse, SingleResponse, Model, ModelDetail } from '@/types';

export async function getModels(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<PaginatedResponse<Model>>(`/v1/admin/models${qs}`);
}

export async function getModel(id: string) {
  return apiFetch<SingleResponse<ModelDetail>>(`/v1/admin/models/${id}`);
}
