import { apiFetch } from './client';
import type { PaginatedResponse, SingleResponse, Incident } from '@/types';
export async function getIncidents() { return apiFetch<PaginatedResponse<Incident>>('/v1/admin/incidents'); }
export async function getIncident(id: string) { return apiFetch<SingleResponse<Incident>>(`/v1/admin/incidents/${id}`); }
export async function updateIncident(id: string, data: Partial<Incident>) { return apiFetch<SingleResponse<Incident>>(`/v1/admin/incidents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }); }
export async function addIncidentAction(id: string, data: { action: string; result?: string }) { return apiFetch(`/v1/admin/incidents/${id}/actions`, { method: 'POST', body: JSON.stringify(data) }); }
