import { apiFetch } from './client';
import type { SingleResponse, Organization } from '@/types';

export async function getOrganization() {
  return apiFetch<SingleResponse<Organization>>('/v1/admin/organization');
}

export async function updateOrganization(data: Partial<Organization>) {
  return apiFetch<SingleResponse<Organization>>('/v1/admin/organization', { method: 'PATCH', body: JSON.stringify(data) });
}
