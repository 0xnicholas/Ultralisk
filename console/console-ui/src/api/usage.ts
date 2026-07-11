import { apiFetch } from './client';
import type { SingleResponse, UsageSummary } from '@/types';

export async function getUsage(range = 'today') {
  return apiFetch<SingleResponse<UsageSummary>>(`/v1/admin/usage?range=${range}`);
}
