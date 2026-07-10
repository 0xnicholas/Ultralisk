import { apiFetch } from './client';
import type { SingleResponse, GpuUtilizationData } from '@/types';

export async function getGpuUtilization() { return apiFetch<SingleResponse<GpuUtilizationData>>('/v1/admin/gpu-utilization'); }
