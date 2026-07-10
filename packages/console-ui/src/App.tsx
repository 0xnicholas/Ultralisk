import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Notifications } from '@mantine/notifications';
import { AuthProvider, useAuth } from '@/stores/AuthContext';
import { theme } from '@/theme';
import { ConsoleLayout } from '@/layouts/ConsoleLayout';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { ModelsPage } from '@/pages/models/ModelsPage';
import { ModelDetailPage } from '@/pages/models/ModelDetailPage';
import { PlaygroundPage } from '@/pages/playground/PlaygroundPage';
import { ApiKeysPage } from '@/pages/api-keys/ApiKeysPage';
import { BillingPage } from '@/pages/billing/BillingPage';
import { ProfilePage } from '@/pages/settings/ProfilePage';

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
              <Route path="/settings/profile" element={<ProfilePage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </MantineProvider>
  );
}
