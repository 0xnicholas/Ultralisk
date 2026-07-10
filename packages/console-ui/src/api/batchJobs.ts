import { apiFetch } from './client';
import type { PaginatedResponse, SingleResponse, BatchJob, CreateBatchJobRequest } from '@/types';

export async function getBatchJobs() {
  return apiFetch<PaginatedResponse<BatchJob>>('/v1/admin/batch-jobs');
}

export async function getBatchJob(id: string) {
  return apiFetch<SingleResponse<BatchJob>>(`/v1/admin/batch-jobs/${id}`);
}

export async function createBatchJob(data: CreateBatchJobRequest) {
  return apiFetch<SingleResponse<BatchJob>>('/v1/admin/batch-jobs', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function cancelBatchJob(id: string) {
  return apiFetch<void>(`/v1/admin/batch-jobs/${id}`, { method: 'DELETE' });
}
