import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AutoRemediationConfig, SlackConfig } from '@/types';
import { getAlerts, suppressAlert, getAutoRemediation, updateAutoRemediation, getSlackConfig, connectSlack, disconnectSlack, updateSlackConfig } from '@/api/alerts';
export function useAlerts() { return useQuery({ queryKey: ['alerts'], queryFn: () => getAlerts().then((r) => r.data) }); }
export function useSuppressAlert() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => suppressAlert(id).then((r) => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }) }); }
export function useAutoRemediation() { return useQuery({ queryKey: ['auto-remediation'], queryFn: () => getAutoRemediation().then((r) => r.data) }); }
export function useUpdateAutoRemediation() { const qc = useQueryClient(); return useMutation({ mutationFn: (d: Partial<AutoRemediationConfig>) => updateAutoRemediation(d).then((r) => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['auto-remediation'] }) }); }
export function useSlackConfig() { return useQuery({ queryKey: ['slack-config'], queryFn: () => getSlackConfig().then((r) => r.data) }); }
export function useConnectSlack() { const qc = useQueryClient(); return useMutation({ mutationFn: () => connectSlack().then((r) => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['slack-config'] }) }); }
export function useDisconnectSlack() { const qc = useQueryClient(); return useMutation({ mutationFn: () => disconnectSlack().then((r) => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['slack-config'] }) }); }
export function useUpdateSlackConfig() { const qc = useQueryClient(); return useMutation({ mutationFn: (d: Partial<SlackConfig>) => updateSlackConfig(d).then((r) => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['slack-config'] }) }); }
