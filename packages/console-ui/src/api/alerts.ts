import { apiFetch } from './client';
import type { PaginatedResponse, SingleResponse, Alert, AutoRemediationConfig, SlackConfig } from '@/types';
export async function getAlerts() { return apiFetch<PaginatedResponse<Alert>>('/v1/admin/alerts'); }
export async function suppressAlert(id: string) { return apiFetch<SingleResponse<Alert>>(`/v1/admin/alerts/${id}/suppress`, { method: 'POST' }); }
export async function getAutoRemediation() { return apiFetch<SingleResponse<AutoRemediationConfig>>('/v1/admin/settings/auto-remediation'); }
export async function updateAutoRemediation(data: Partial<AutoRemediationConfig>) { return apiFetch<SingleResponse<AutoRemediationConfig>>('/v1/admin/settings/auto-remediation', { method: 'PATCH', body: JSON.stringify(data) }); }
export async function getSlackConfig() { return apiFetch<SingleResponse<SlackConfig>>('/v1/admin/settings/integrations/slack'); }
export async function connectSlack() { return apiFetch<SingleResponse<SlackConfig>>('/v1/admin/settings/integrations/slack/connect', { method: 'POST' }); }
export async function disconnectSlack() { return apiFetch<SingleResponse<SlackConfig>>('/v1/admin/settings/integrations/slack/disconnect', { method: 'POST' }); }
