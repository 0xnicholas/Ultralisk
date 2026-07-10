import { apiFetch } from './client';
import type { PaginatedResponse, SingleResponse, Cluster, ClusterDetail } from '@/types';

export async function getClusters() { return apiFetch<PaginatedResponse<Cluster>>('/v1/admin/clusters'); }
export async function getCluster(id: string) { return apiFetch<SingleResponse<ClusterDetail>>(`/v1/admin/clusters/${id}`); }
