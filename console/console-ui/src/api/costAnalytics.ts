import { apiFetch } from './client';
import type { SingleResponse, CostAnalyticsData } from '@/types';
export async function getCostAnalytics() { return apiFetch<SingleResponse<CostAnalyticsData>>('/v1/admin/cost-analytics'); }
