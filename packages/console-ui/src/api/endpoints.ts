import { apiFetch } from './client';
import type { PaginatedResponse, SingleResponse, Endpoint, CreateEndpointRequest } from '@/types';

export async function getEndpoints() { return apiFetch<PaginatedResponse<Endpoint>>('/v1/admin/endpoints'); }
export async function getEndpoint(id: string) { return apiFetch<SingleResponse<Endpoint>>(`/v1/admin/endpoints/${id}`); }
export async function createEndpoint(data: CreateEndpointRequest) { return apiFetch<SingleResponse<Endpoint>>('/v1/admin/endpoints', { method: 'POST', body: JSON.stringify(data) }); }
export async function updateEndpoint(id: string, data: Partial<Endpoint>) { return apiFetch<SingleResponse<Endpoint>>(`/v1/admin/endpoints/${id}`, { method: 'PATCH', body: JSON.stringify(data) }); }
export async function deleteEndpoint(id: string) { return apiFetch<void>(`/v1/admin/endpoints/${id}`, { method: 'DELETE' }); }
