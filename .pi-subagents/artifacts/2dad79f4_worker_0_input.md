# Task for worker

You are implementing Task 2: App Shell — Theme, Layout, Routing, AuthContext

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

The monorepo scaffold is already done (Task 1). You need to create the application shell files.

## Step 1: Write Mantine theme

Create `packages/console-ui/src/theme.ts`:
```typescript
import { createTheme, DEFAULT_THEME, mergeMantineTheme } from '@mantine/core';

const themeOverride = createTheme({
  primaryColor: 'violet',
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  headings: { fontFamily: 'Inter, system-ui, -apple-system, sans-serif' },
  defaultRadius: 'md',
  colors: {
    dark: [
      '#C1C2C5', '#A6A7AB', '#909296', '#5C5F66',
      '#373A40', '#2C2E33', '#25262B', '#1A1B1E',
      '#141517', '#101113',
    ],
  },
});

export const theme = mergeMantineTheme(DEFAULT_THEME, themeOverride);
```

## Step 2: Write AuthContext

Create `packages/console-ui/src/stores/AuthContext.tsx`:
```typescript
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  jwt: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  acceptInvitation: (token: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const JWT_KEY = 'ultralisk_jwt';
const USER_KEY = 'ultralisk_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem(USER_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [jwt, setJwt] = useState<string | null>(() => localStorage.getItem(JWT_KEY));
  const [isLoading, setIsLoading] = useState(false);

  const saveAuth = useCallback((user: User, jwt: string) => {
    setUser(user);
    setJwt(jwt);
    localStorage.setItem(JWT_KEY, jwt);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const { login: apiLogin } = await import('@/api/auth');
      const { data } = await apiLogin(email, password);
      saveAuth(data.user, data.jwt);
    } finally {
      setIsLoading(false);
    }
  }, [saveAuth]);

  const acceptInvitation = useCallback(async (token: string, password: string) => {
    setIsLoading(true);
    try {
      const { acceptInvitation: apiAccept } = await import('@/api/auth');
      const { data } = await apiAccept(token, password);
      saveAuth(data.user, data.jwt);
    } finally {
      setIsLoading(false);
    }
  }, [saveAuth]);

  const logout = useCallback(() => {
    setUser(null);
    setJwt(null);
    localStorage.removeItem(JWT_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  return (
    <AuthContext.Provider value={{ user, jwt, isLoading, login, acceptInvitation, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

## Step 3: Write API client

Create `packages/console-ui/src/api/client.ts`:
```typescript
const JWT_KEY = 'ultralisk_jwt';

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const jwt = localStorage.getItem(JWT_KEY);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`;

  const res = await fetch(path, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { code: 'unknown', message: res.statusText } }));
    throw new Error(err.error?.message ?? res.statusText);
  }

  return res.json();
}
```

## Step 4: Write Sidebar

Create `packages/console-ui/src/components/Sidebar.tsx`:
```typescript
import { NavLink, Stack, Text, ThemeIcon } from '@mantine/core';
import {
  IconLayoutDashboard, IconMessage, IconBox, IconKey,
  IconReceipt2
} from '@tabler/icons-react';
import { useLocation, useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { section: 'Home', items: [
    { label: 'Dashboard', icon: IconLayoutDashboard, path: '/dashboard' },
  ]},
  { section: 'Develop', items: [
    { label: 'Playground', icon: IconMessage, path: '/playground' },
    { label: 'Models', icon: IconBox, path: '/models' },
    { label: 'API Keys', icon: IconKey, path: '/api-keys' },
  ]},
  { section: 'Organization', items: [
    { label: 'Billing', icon: IconReceipt2, path: '/billing' },
  ]},
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Stack gap="xs" p="md">
      {NAV_ITEMS.map((group) => (
        <Stack key={group.section} gap={2}>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={4}>
            {group.section}
          </Text>
          {group.items.map((item) => (
            <NavLink
              key={item.path}
              label={item.label}
              leftSection={
                <ThemeIcon variant="light" size="sm">
                  <item.icon size={16} />
                </ThemeIcon>
              }
              active={location.pathname.startsWith(item.path)}
              onClick={() => navigate(item.path)}
              variant="light"
              styles={{ root: { borderRadius: 'var(--mantine-radius-md)' } }}
            />
          ))}
        </Stack>
      ))}
    </Stack>
  );
}
```

## Step 5: Write TopBar

Create `packages/console-ui/src/components/TopBar.tsx`:
```typescript
import { Group, ActionIcon, Text, Avatar, Menu, useMantineColorScheme } from '@mantine/core';
import { IconSun, IconMoon, IconLogout, IconSettings } from '@tabler/icons-react';
import { useAuth } from '@/stores/AuthContext';
import { useNavigate } from 'react-router-dom';

export function TopBar() {
  const { user, logout } = useAuth();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const navigate = useNavigate();

  return (
    <Group h="100%" px="md" justify="space-between">
      <Group>
        <Text fw={700} size="lg">Ultralisk</Text>
      </Group>
      <Group>
        <ActionIcon
          variant="default"
          size="lg"
          onClick={toggleColorScheme}
          aria-label="Toggle color scheme"
        >
          {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
        </ActionIcon>
        {user && (
          <Menu shadow="md" width={200}>
            <Menu.Target>
              <Avatar color="violet" radius="xl" style={{ cursor: 'pointer' }}>
                {user.name.charAt(0).toUpperCase()}
              </Avatar>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{user.email}</Menu.Label>
              <Menu.Item
                leftSection={<IconSettings size={14} />}
                onClick={() => navigate('/settings/profile')}
              >
                Settings
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                color="red"
                leftSection={<IconLogout size={14} />}
                onClick={logout}
              >
                Log out
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>
    </Group>
  );
}
```

## Step 6: Write ConsoleLayout

Create `packages/console-ui/src/layouts/ConsoleLayout.tsx`:
```typescript
import { AppShell } from '@mantine/core';
import { Outlet } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { Sidebar } from '@/components/Sidebar';

export function ConsoleLayout() {
  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: 'sm' }}
      padding="md"
    >
      <AppShell.Header>
        <TopBar />
      </AppShell.Header>
      <AppShell.Navbar>
        <Sidebar />
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
```

## Step 7: Write App with routing

Create `packages/console-ui/src/App.tsx`:
```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Notifications } from '@mantine/notifications';
import { AuthProvider, useAuth } from '@/stores/AuthContext';
import { theme } from '@/theme';
import { ConsoleLayout } from '@/layouts/ConsoleLayout';

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
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </MantineProvider>
  );
}
```

## Step 8: Write entry point

Create `packages/console-ui/src/main.tsx`:
```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

## Step 9: Verify build compiles

```bash
cd packages/console-ui && pnpm typecheck
```

Note: This will fail on missing imports for LoginPage and AcceptInvitationPage (created in Task 3). That is expected. The important thing is that all the files you created have correct imports and no syntax errors besides the missing page references.

If there are type errors ONLY about missing LoginPage and AcceptInvitationPage, that's OK. If there are other errors, fix them.

Actually — to make this work, you'll need to also create stub placeholder files for the two auth pages that App.tsx imports. Create simple placeholder components:

`packages/console-ui/src/pages/auth/LoginPage.tsx`:
```typescript
export function LoginPage() {
  return null;
}
```

`packages/console-ui/src/pages/auth/AcceptInvitationPage.tsx`:
```typescript
export function AcceptInvitationPage() {
  return null;
}
```

These will be replaced in Task 3.

Also, the AuthContext imports `@/types` which doesn't exist yet. Create a minimal stub:

`packages/console-ui/src/types/index.ts`:
```typescript
export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: 'admin' | 'developer' | 'readonly';
  org_id: string;
  org_name: string;
  created_at: string;
}
```

And the AuthContext imports `@/api/auth` which doesn't exist. Create a minimal stub:

`packages/console-ui/src/api/auth.ts`:
```typescript
import { apiFetch } from './client';
import type { User, SingleResponse } from '@/types';

// Minimal stub — Task 3 will flesh this out

export async function login(email: string, password: string) {
  return apiFetch<SingleResponse<{ user: User; jwt: string }>>('/v1/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function acceptInvitation(token: string, password: string) {
  return apiFetch<SingleResponse<{ user: User; jwt: string }>>('/v1/admin/auth/accept-invitation', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

export async function getMe() {
  return apiFetch<SingleResponse<User>>('/v1/admin/auth/me');
}
```

You'll also need `SingleResponse` in types. Add it:
```typescript
export interface SingleResponse<T> {
  data: T;
}
```

## Step 10: Verify typecheck

```bash
cd packages/console-ui && pnpm typecheck
```

Expected: No TypeScript errors.

## Step 11: Commit

```bash
git add packages/console-ui/src
git commit -m "feat: add app shell with Mantine theme, AuthContext, ConsoleLayout, routing"
```

## Context

This is Task 2 of 11. Task 1 (monorepo scaffold) is complete. The `main.tsx` imports must use relative path `./App` (not `@/App`) since it's in the same src directory.

The `@/` alias resolves to `src/` via vite.config.ts.

## Before You Begin

Ask questions if anything is unclear.

## Your Job

Create all files, verify typecheck passes, commit.

## Acceptance Contract
Acceptance level: checked
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope

Required evidence: changed-files, tests-added, commands-run, residual-risks, no-staged-files

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```