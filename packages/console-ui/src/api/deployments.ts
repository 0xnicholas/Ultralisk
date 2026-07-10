import { apiFetch } from './client';
import type { PaginatedResponse, SingleResponse, Deployment, DeploymentDetail } from '@/types';

export async function getDeployments() { return apiFetch<PaginatedResponse<Deployment>>('/v1/admin/deployments'); }
export async function getDeployment(id: string) { return apiFetch<SingleResponse<DeploymentDetail>>(`/v1/admin/deployments/${id}`); }
export async function scaleDeployment(id: string, replicas: number) { return apiFetch<SingleResponse<Deployment>>(`/v1/admin/deployments/${id}/scale`, { method: 'POST', body: JSON.stringify({ replicas }) }); }
export async function rollbackDeployment(id: string) { return apiFetch<SingleResponse<Deployment>>(`/v1/admin/deployments/${id}/rollback`, { method: 'POST' }); }
