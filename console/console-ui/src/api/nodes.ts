import { apiFetch } from './client';
import type { PaginatedResponse, SingleResponse, Node, NodeDetail } from '@/types';

export async function getNodes() { return apiFetch<PaginatedResponse<Node>>('/v1/admin/nodes'); }
export async function getNode(id: string) { return apiFetch<SingleResponse<NodeDetail>>(`/v1/admin/nodes/${id}`); }
export async function getClusterNode(clusterId: string, nodeId: string) { return apiFetch<SingleResponse<NodeDetail>>(`/v1/admin/clusters/${clusterId}/nodes/${nodeId}`); }
