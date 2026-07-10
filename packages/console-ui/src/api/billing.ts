import { apiFetch } from './client';
import type { SingleResponse, Billing } from '@/types';

export async function getBilling() {
  return apiFetch<SingleResponse<Billing>>('/v1/admin/billing');
}
