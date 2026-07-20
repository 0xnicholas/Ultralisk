import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Center, Loader, MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Notifications } from '@mantine/notifications';
import { AuthProvider } from '@/stores/AuthContext';
import { useAuth } from '@/stores/useAuth';
import { theme } from '@/theme';
import { ConsoleLayout } from '@/layouts/ConsoleLayout';
import { isSaaS } from '@/utils/deployment';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { showApiError } from '@/api/errorHandler';

import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/charts/styles.css';

// Code-split every page. Each becomes its own chunk so the initial
// bundle only ships the LoginPage + the framework; navigating to
// /dashboard etc. downloads that chunk on demand.
const LoginPage = lazy(() => import('@/pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const AcceptInvitationPage = lazy(() => import('@/pages/auth/AcceptInvitationPage').then((m) => ({ default: m.AcceptInvitationPage })));
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ModelsPage = lazy(() => import('@/pages/models/ModelsPage').then((m) => ({ default: m.ModelsPage })));
const ModelDetailPage = lazy(() => import('@/pages/models/ModelDetailPage').then((m) => ({ default: m.ModelDetailPage })));
const ModelRegistryPage = lazy(() => import('@/pages/models/ModelRegistryPage').then((m) => ({ default: m.ModelRegistryPage })));
const PlaygroundPage = lazy(() => import('@/pages/playground/PlaygroundPage').then((m) => ({ default: m.PlaygroundPage })));
const ProfilePage = lazy(() => import('@/pages/settings/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const EndpointsPage = lazy(() => import('@/pages/endpoints/EndpointsPage').then((m) => ({ default: m.EndpointsPage })));
const CreateEndpointPage = lazy(() => import('@/pages/endpoints/CreateEndpointPage').then((m) => ({ default: m.CreateEndpointPage })));
const EndpointDetailPage = lazy(() => import('@/pages/endpoints/EndpointDetailPage').then((m) => ({ default: m.EndpointDetailPage })));
const BatchJobsPage = lazy(() => import('@/pages/batch-jobs/BatchJobsPage').then((m) => ({ default: m.BatchJobsPage })));
const CreateBatchJobPage = lazy(() => import('@/pages/batch-jobs/CreateBatchJobPage').then((m) => ({ default: m.CreateBatchJobPage })));
const BatchJobDetailPage = lazy(() => import('@/pages/batch-jobs/BatchJobDetailPage').then((m) => ({ default: m.BatchJobDetailPage })));
const ClustersPage = lazy(() => import('@/pages/clusters/ClustersPage').then((m) => ({ default: m.ClustersPage })));
const ClusterDetailPage = lazy(() => import('@/pages/clusters/ClusterDetailPage').then((m) => ({ default: m.ClusterDetailPage })));
const NodesPage = lazy(() => import('@/pages/nodes/NodesPage').then((m) => ({ default: m.NodesPage })));
const NodeDetailPage = lazy(() => import('@/pages/nodes/NodeDetailPage').then((m) => ({ default: m.NodeDetailPage })));
const DeploymentsPage = lazy(() => import('@/pages/deployments/DeploymentsPage').then((m) => ({ default: m.DeploymentsPage })));
const DeploymentDetailPage = lazy(() => import('@/pages/deployments/DeploymentDetailPage').then((m) => ({ default: m.DeploymentDetailPage })));
const GpuUtilizationPage = lazy(() => import('@/pages/gpu-utilization/GpuUtilizationPage').then((m) => ({ default: m.GpuUtilizationPage })));
const CostAnalyticsPage = lazy(() => import('@/pages/cost-analytics/CostAnalyticsPage').then((m) => ({ default: m.CostAnalyticsPage })));
const AlertsPage = lazy(() => import('@/pages/alerts/AlertsPage').then((m) => ({ default: m.AlertsPage })));
const IncidentsPage = lazy(() => import('@/pages/incidents/IncidentsPage').then((m) => ({ default: m.IncidentsPage })));
const IncidentDetailPage = lazy(() => import('@/pages/incidents/IncidentDetailPage').then((m) => ({ default: m.IncidentDetailPage })));
const OperationsSettingsPage = lazy(() => import('@/pages/settings/OperationsSettingsPage').then((m) => ({ default: m.OperationsSettingsPage })));
const IntegrationsPage = lazy(() => import('@/pages/settings/IntegrationsPage').then((m) => ({ default: m.IntegrationsPage })));
const OrganizationPage = lazy(() => import('@/pages/settings/OrganizationPage').then((m) => ({ default: m.OrganizationPage })));
const ApiKeysPage = lazy(() => import('@/pages/api-keys/ApiKeysPage').then((m) => ({ default: m.ApiKeysPage })));
const BillingPage = lazy(() => import('@/pages/billing/BillingPage').then((m) => ({ default: m.BillingPage })));
const SetupWizardPage = lazy(() => import('@/private/pages/setup/SetupWizardPage').then((m) => ({ default: m.SetupWizardPage })));
const AuditLogPage = lazy(() => import('@/private/pages/audit-logs/AuditLogPage').then((m) => ({ default: m.AuditLogPage })));
const SsoConfigPage = lazy(() => import('@/private/pages/settings/sso/SsoConfigPage').then((m) => ({ default: m.SsoConfigPage })));
const CompliancePage = lazy(() => import('@/private/pages/compliance/CompliancePage').then((m) => ({ default: m.CompliancePage })));
const LicensePage = lazy(() => import('@/private/pages/license/LicensePage').then((m) => ({ default: m.LicensePage })));

function PageLoader() {
  return (
    <Center mih="60vh">
      <Loader size="md" />
    </Center>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
    mutations: {
      onError: (error) => showApiError(error),
    },
  },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
                  <Route
                    element={
                      <AuthGuard>
                        <ConsoleLayout />
                      </AuthGuard>
                    }
                  >
                    <Route index element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/models" element={<ModelsPage />} />
                    <Route path="/models/:modelId" element={<ModelDetailPage />} />
                    <Route path="/models/registry" element={<ModelRegistryPage />} />
                    <Route path="/playground" element={<PlaygroundPage />} />
                    <Route path="/playground/:sessionId" element={<PlaygroundPage />} />
                    <Route path="/endpoints" element={<EndpointsPage />} />
                    <Route path="/endpoints/new" element={<CreateEndpointPage />} />
                    <Route path="/endpoints/:id" element={<EndpointDetailPage />} />
                    <Route path="/batch-jobs" element={<BatchJobsPage />} />
                    <Route path="/batch-jobs/new" element={<CreateBatchJobPage />} />
                    <Route path="/batch-jobs/:id" element={<BatchJobDetailPage />} />
                    <Route path="/settings/profile" element={<ProfilePage />} />
                    <Route path="/clusters" element={<ClustersPage />} />
                    <Route path="/clusters/:id" element={<ClusterDetailPage />} />
                    <Route path="/clusters/:clusterId/nodes/:nodeId" element={<NodeDetailPage />} />
                    <Route path="/nodes" element={<NodesPage />} />
                    <Route path="/nodes/:id" element={<NodeDetailPage />} />
                    <Route path="/deployments" element={<DeploymentsPage />} />
                    <Route path="/deployments/:id" element={<DeploymentDetailPage />} />
                    <Route path="/gpu-utilization" element={<GpuUtilizationPage />} />
                    <Route path="/cost-analytics" element={<CostAnalyticsPage />} />
                    <Route path="/incidents" element={<IncidentsPage />} />
                    <Route path="/incidents/:id" element={<IncidentDetailPage />} />
                    <Route path="/alerts" element={<AlertsPage />} />
                    <Route path="/settings/organization" element={<OrganizationPage />} />
                    <Route path="/settings/operations" element={<OperationsSettingsPage />} />
                    <Route path="/settings/integrations" element={<IntegrationsPage />} />
                    {isSaaS() && (
                      <>
                        <Route path="/api-keys" element={<ApiKeysPage />} />
                        <Route path="/billing" element={<BillingPage />} />
                      </>
                    )}
                    {!isSaaS() && <Route path="/setup" element={<SetupWizardPage />} />}
                    {!isSaaS() && <Route path="/audit-logs" element={<AuditLogPage />} />}
                    {!isSaaS() && <Route path="/settings/sso" element={<SsoConfigPage />} />}
                    {!isSaaS() && <Route path="/compliance" element={<CompliancePage />} />}
                    {!isSaaS() && <Route path="/license" element={<LicensePage />} />}
                  </Route>
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </MantineProvider>
  );
}
