import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Notifications } from '@mantine/notifications';
import { AuthProvider, useAuth } from '@/stores/AuthContext';
import { theme } from '@/theme';
import { ConsoleLayout } from '@/layouts/ConsoleLayout';
import { LoginPage } from '@/pages/auth/LoginPage';
import { AcceptInvitationPage } from '@/pages/auth/AcceptInvitationPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { ModelsPage } from '@/pages/models/ModelsPage';
import { ModelDetailPage } from '@/pages/models/ModelDetailPage';
import { PlaygroundPage } from '@/pages/playground/PlaygroundPage';
import { ApiKeysPage } from '@/pages/api-keys/ApiKeysPage';
import { BillingPage } from '@/pages/billing/BillingPage';
import { ProfilePage } from '@/pages/settings/ProfilePage';
import { EndpointsPage } from '@/pages/endpoints/EndpointsPage';
import { CreateEndpointPage } from '@/pages/endpoints/CreateEndpointPage';
import { EndpointDetailPage } from '@/pages/endpoints/EndpointDetailPage';
import { BatchJobsPage } from '@/pages/batch-jobs/BatchJobsPage';
import { CreateBatchJobPage } from '@/pages/batch-jobs/CreateBatchJobPage';
import { BatchJobDetailPage } from '@/pages/batch-jobs/BatchJobDetailPage';
import { ClustersPage } from '@/pages/clusters/ClustersPage';
import { ClusterDetailPage } from '@/pages/clusters/ClusterDetailPage';
import { NodesPage } from '@/pages/nodes/NodesPage';
import { NodeDetailPage } from '@/pages/nodes/NodeDetailPage';
import { DeploymentsPage } from '@/pages/deployments/DeploymentsPage';
import { DeploymentDetailPage } from '@/pages/deployments/DeploymentDetailPage';
import { GpuUtilizationPage } from '@/pages/gpu-utilization/GpuUtilizationPage';
import { CostAnalyticsPage } from '@/pages/cost-analytics/CostAnalyticsPage';
import { IncidentsPage } from '@/pages/incidents/IncidentsPage';
import { IncidentDetailPage } from '@/pages/incidents/IncidentDetailPage';
import { OperationsSettingsPage } from '@/pages/settings/OperationsSettingsPage';
import { IntegrationsPage } from '@/pages/settings/IntegrationsPage';
import { OrganizationPage } from '@/pages/settings/OrganizationPage';

import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/charts/styles.css';

const queryClient = new QueryClient();

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
              <Route path="/playground" element={<PlaygroundPage />} />
              <Route path="/playground/:sessionId" element={<PlaygroundPage />} />
              <Route path="/api-keys" element={<ApiKeysPage />} />
              <Route path="/billing" element={<BillingPage />} />
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
              <Route path="/settings/organization" element={<OrganizationPage />} />
              <Route path="/settings/operations" element={<OperationsSettingsPage />} />
              <Route path="/settings/integrations" element={<IntegrationsPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </MantineProvider>
  );
}
