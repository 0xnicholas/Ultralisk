# Ultralisk Console Phase 1a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1a MVP of Ultralisk Web Console — a developer-first AI inference control panel with Dashboard, Models, Playground, API Keys, Billing, and Auth.

**Architecture:** Monorepo (turborepo) with `packages/console-ui` (React 19.2 + Mantine v9 + TypeScript + Vite) and `packages/console-api` (stub backend). Console UI uses React Router v7, TanStack React Query for server state, Mantine CSS Modules for styling. Playground uses SSE for streaming; auth uses JWT via AuthContext.

**Tech Stack:** React 19.2, TypeScript 5.7+, Mantine v9, @mantine/charts, @tanstack/react-query v5, React Router v7, Vite 6, turborepo, pnpm

**Reference specs:**
- Design: `docs/superpowers/specs/2026-07-10-ultralisk-console-design.md`
- Competitive analysis: `docs/superpowers/specs/2026-07-10-console-competitive-analysis.md`

**Priority context from competitive analysis:**
- Playground is the #1 differentiator vs Together AI — invest heavily in multi-session, persistence, and error states
- API Keys with role + model whitelist is a micro-advantage over Together
- Models page: curated 10-20 (not 200+) + dedicated detail page
- Billing with per-key split is a micro-advantage

---

## File Structure

```
packages/console-ui/
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── postcss.config.cjs
├── src/
│   ├── main.tsx                          # Entry point, providers
│   ├── App.tsx                           # Router + AuthGuard
│   ├── theme.ts                          # Mantine theme (colors, dark mode)
│   ├── vite-env.d.ts
│   ├── layouts/
│   │   └── ConsoleLayout.tsx             # AppShell: TopBar + Navbar + content
│   ├── pages/
│   │   ├── auth/
│   │   │   ├── AcceptInvitationPage.tsx
│   │   │   └── LoginPage.tsx
│   │   ├── dashboard/
│   │   │   └── DashboardPage.tsx
│   │   ├── models/
│   │   │   ├── ModelsPage.tsx
│   │   │   └── ModelDetailPage.tsx
│   │   ├── playground/
│   │   │   └── PlaygroundPage.tsx
│   │   ├── api-keys/
│   │   │   └── ApiKeysPage.tsx
│   │   ├── billing/
│   │   │   └── BillingPage.tsx
│   │   └── settings/
│   │       └── ProfilePage.tsx
│   ├── components/
│   │   ├── TopBar.tsx
│   │   ├── Sidebar.tsx
│   │   ├── dashboard/
│   │   │   ├── AccountStatusBanner.tsx
│   │   │   ├── DeveloperQuickstart.tsx
│   │   │   ├── UsageSummaryCards.tsx
│   │   │   ├── QuickActions.tsx
│   │   │   ├── RecentActivity.tsx
│   │   │   └── ExamplesResources.tsx
│   │   ├── models/
│   │   │   ├── FeaturedModels.tsx
│   │   │   ├── ModelsTable.tsx
│   │   │   └── ModelFilters.tsx
│   │   ├── playground/
│   │   │   ├── ModelSelector.tsx
│   │   │   ├── ChatArea.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── SettingsPanel.tsx
│   │   │   ├── SessionTabs.tsx
│   │   ├── api-keys/
│   │   │   ├── KeyList.tsx
│   │   │   └── CreateKeyModal.tsx
│   │   └── billing/
│   │       ├── BalanceCard.tsx
│   │       ├── UsageChart.tsx
│   │       └── InvoicesTable.tsx
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useModels.ts
│   │   ├── useApiKeys.ts
│   │   ├── useBilling.ts
│   │   ├── useUsage.ts
│   │   ├── usePlaygroundChat.ts
│   │   └── usePlaygroundSession.ts
│   ├── api/
│   │   ├── client.ts                     # Fetch wrapper with JWT injection
│   │   ├── auth.ts
│   │   ├── models.ts
│   │   ├── apiKeys.ts
│   │   ├── billing.ts
│   │   ├── usage.ts
│   │   └── chat.ts                       # SSE streaming for Playground
│   ├── stores/
│   │   └── AuthContext.tsx               # JWT + user state
│   ├── types/
│   │   └── index.ts                      # All shared TypeScript interfaces
│   └── utils/
│       ├── format.ts                     # Currency, date, token count formatters
│       └── storage.ts                    # localStorage helpers for sessions
├── public/
│   └── favicon.svg

packages/console-api/                      # Stub backend (Phase 1a: mock responses)
├── package.json
├── tsconfig.json
└── src/
    └── index.ts                           # Express stub with JSON fixtures
```

---

## Task 1: Monorepo Scaffold & Tooling

**Files:**
- Create: `package.json` (root), `turbo.json`, `pnpm-workspace.yaml`, `.npmrc`
- Create: `packages/console-ui/package.json`, `packages/console-ui/tsconfig.json`, `packages/console-ui/tsconfig.node.json`, `packages/console-ui/vite.config.ts`, `packages/console-ui/postcss.config.cjs`, `packages/console-ui/index.html`
- Create: `packages/console-api/package.json`, `packages/console-api/tsconfig.json`

- [ ] **Step 1: Create root workspace config**

```bash
mkdir -p packages/console-ui packages/console-api
```

Write `pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
```

Write root `package.json`:

```json
{
  "name": "ultralisk-console",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck"
  },
  "devDependencies": {
    "turbo": "^2.4.0",
    "typescript": "^5.7.0"
  },
  "packageManager": "pnpm@9.15.0",
  "engines": {
    "node": ">=20"
  }
}
```

Write `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": {},
    "typecheck": { "dependsOn": ["^build"] }
  }
}
```

Write `.npmrc`:

```
auto-install-peers=true
strict-peer-dependencies=false
```

- [ ] **Step 2: Scaffold console-ui package**

Write `packages/console-ui/package.json`:

```json
{
  "name": "@ultralisk/console-ui",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 5173",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@mantine/charts": "^9.0.0",
    "@mantine/core": "^9.0.0",
    "@mantine/form": "^9.0.0",
    "@mantine/hooks": "^9.0.0",
    "@mantine/notifications": "^9.0.0",
    "@tabler/icons-react": "^3.31.0",
    "@tanstack/react-query": "^5.62.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-router-dom": "^7.1.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.4.0",
    "postcss": "^8.5.0",
    "postcss-preset-mantine": "^1.18.0",
    "postcss-simple-vars": "^7.0.1",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

Write `packages/console-ui/vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/v1/admin': 'http://localhost:3001',
      '/v1/chat': 'http://localhost:3001',
    },
  },
});
```

Write `packages/console-ui/postcss.config.cjs`:

```javascript
module.exports = {
  plugins: {
    'postcss-preset-mantine': {},
    'postcss-simple-vars': {
      variables: {
        'mantine-breakpoint-xs': '36em',
        'mantine-breakpoint-sm': '48em',
        'mantine-breakpoint-md': '62em',
        'mantine-breakpoint-lg': '75em',
        'mantine-breakpoint-xl': '88em',
      },
    },
  },
};
```

Write `packages/console-ui/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

Write `packages/console-ui/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ultralisk Console</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Write `packages/console-ui/src/vite-env.d.ts`:

```typescript
/// <reference types="vite/client" />
```

- [ ] **Step 3: Scaffold console-api stub package**

Write `packages/console-api/package.json`:

```json
{
  "name": "@ultralisk/console-api",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "express": "^5.1.0",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/cors": "^2.8.17",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

Write `packages/console-api/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Install dependencies and verify**

```bash
pnpm install
```

Expected: all packages install without errors.

- [ ] **Step 5: Verify dev server starts**

```bash
cd packages/console-ui && pnpm dev
```

Expected: Vite starts on `http://localhost:5173`, shows blank page (no React root yet).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold monorepo with console-ui (Vite+React+Mantine) and console-api (Express stub)"
```

---

## Task 2: App Shell — Theme, Layout, Routing, AuthContext

**Files:**
- Create: `packages/console-ui/src/main.tsx`
- Create: `packages/console-ui/src/App.tsx`
- Create: `packages/console-ui/src/theme.ts`
- Create: `packages/console-ui/src/stores/AuthContext.tsx`
- Create: `packages/console-ui/src/layouts/ConsoleLayout.tsx`
- Create: `packages/console-ui/src/components/TopBar.tsx`
- Create: `packages/console-ui/src/components/Sidebar.tsx`
- Create: `packages/console-ui/src/api/client.ts`

- [ ] **Step 1: Write Mantine theme**

Write `packages/console-ui/src/theme.ts`:

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

- [ ] **Step 2: Write AuthContext**

Write `packages/console-ui/src/stores/AuthContext.tsx`:

```typescript
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
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
    const stored = localStorage.getItem(USER_KEY);
    return stored ? JSON.parse(stored) : null;
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

- [ ] **Step 3: Write API client**

Write `packages/console-ui/src/api/client.ts`:

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

- [ ] **Step 4: Write Sidebar**

Write `packages/console-ui/src/components/Sidebar.tsx`:

```typescript
import { NavLink, Stack, Text, ThemeIcon } from '@mantine/core';
import {
  IconLayoutDashboard, IconMessage, IconBox, IconKey,
  IconReceipt2, IconSettings
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

- [ ] **Step 5: Write TopBar**

Write `packages/console-ui/src/components/TopBar.tsx`:

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

- [ ] **Step 6: Write ConsoleLayout**

Write `packages/console-ui/src/layouts/ConsoleLayout.tsx`:

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

- [ ] **Step 7: Write App with routing**

Write `packages/console-ui/src/App.tsx`:

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Notifications } from '@mantine/notifications';
import { AuthProvider, useAuth } from '@/stores/AuthContext';
import { theme } from '@/theme';
import { ConsoleLayout } from '@/layouts/ConsoleLayout';
import { LoginPage } from '@/pages/auth/LoginPage';
import { AcceptInvitationPage } from '@/pages/auth/AcceptInvitationPage';

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
                {/* Pages added in subsequent tasks */}
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </MantineProvider>
  );
}
```

- [ ] **Step 8: Write entry point**

Write `packages/console-ui/src/main.tsx`:

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

- [ ] **Step 9: Verify build compiles**

```bash
cd packages/console-ui && pnpm typecheck
```

Expected: should fail on missing page imports (LoginPage, AcceptInvitationPage) — these are created in the next task. Temporarily, create placeholder files.

- [ ] **Step 10: Commit**

```bash
git add packages/console-ui/src
git commit -m "feat: add app shell with Mantine theme, AuthContext, ConsoleLayout, routing"
```

---

## Task 3: Types, Auth API, and Auth Pages

**Files:**
- Create: `packages/console-ui/src/types/index.ts`
- Create: `packages/console-ui/src/api/auth.ts`
- Create: `packages/console-ui/src/pages/auth/LoginPage.tsx`
- Create: `packages/console-ui/src/pages/auth/AcceptInvitationPage.tsx`

- [ ] **Step 1: Write shared types**

Write `packages/console-ui/src/types/index.ts`:

```typescript
// === User & Auth ===
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

// === Models ===
export interface Model {
  id: string;
  display_name: string;
  author: string;
  category: 'chat' | 'embedding' | 'image' | 'audio' | 'video' | 'moderation';
  description: string;
  capabilities: {
    context_window: number;
    max_output_tokens: number;
    json_mode: boolean;
    tool_calling: boolean;
    multi_modal: boolean;
    fine_tuning: boolean;
  };
  pricing: {
    serverless: {
      input_per_1m_tokens: number;
      output_per_1m_tokens: number;
      cached_input_per_1m_tokens?: number;
    };
    batch_discount_percent?: number;
    dedicated?: {
      gpu_type: string;
      price_per_hour: number;
    };
  };
  deployment_types: ('serverless' | 'dedicated')[];
  status: 'available' | 'degraded' | 'unavailable';
  version: string;
  featured: boolean;
  created_at: string;
}

export interface ModelDetail extends Model {
  usage_examples: {
    curl: string;
    python: string;
    typescript: string;
  };
}

// === API Keys ===
export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  role: 'admin' | 'developer' | 'readonly';
  model_allowlist: string[] | null;
  monthly_quota_usd: number | null;
  usage_this_month_usd: number;
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  status: 'active' | 'revoked';
}

export interface ApiKeyCreated extends ApiKey {
  secret: string;
}

export interface CreateApiKeyRequest {
  name: string;
  role: 'admin' | 'developer' | 'readonly';
  model_allowlist?: string[];
  monthly_quota_usd?: number;
}

// === Usage ===
export interface UsageSummary {
  period: { from: string; to: string };
  totals: {
    requests: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  };
  by_model: {
    model_id: string;
    model_display_name: string;
    requests: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  }[];
  by_key: {
    key_id: string;
    key_name: string;
    key_prefix: string;
    requests: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  }[];
  recent_activity: {
    timestamp: string;
    model_id: string;
    status_code: number;
    latency_ms: number;
    tokens: number;
  }[];
}

// === Billing ===
export interface Billing {
  balance_usd: number;
  monthly_budget_usd: number | null;
  month_to_date_spend_usd: number;
  estimated_month_end_usd: number;
  auto_recharge_enabled: boolean;
  invoices: {
    id: string;
    period: string;
    amount_usd: number;
    status: 'paid' | 'pending' | 'overdue';
    download_url: string;
    issued_at: string;
  }[];
}

// === Chat ===
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface PlaygroundSession {
  id: string;
  name: string;
  modelId: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

// === API Response wrappers ===
export interface PaginatedResponse<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number };
}

export interface SingleResponse<T> {
  data: T;
}
```

- [ ] **Step 2: Write auth API module**

Write `packages/console-ui/src/api/auth.ts`:

```typescript
import { apiFetch } from './client';
import type { User, SingleResponse } from '@/types';

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

- [ ] **Step 3: Write LoginPage**

Write `packages/console-ui/src/pages/auth/LoginPage.tsx`:

```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Paper, Title, TextInput, PasswordInput, Button, Text, Anchor, Stack, Alert } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useAuth } from '@/stores/AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container size={420} my={80}>
      <Title ta="center" mb="lg">Ultralisk Console</Title>
      <Paper withBorder shadow="md" p={30} radius="md">
        <form onSubmit={handleSubmit}>
          <Stack>
            <Text size="sm" c="dimmed" ta="center">
              Sign in to your account
            </Text>
            {error && (
              <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
                {error}
              </Alert>
            )}
            <TextInput
              label="Email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
            <PasswordInput
              label="Password"
              placeholder="Your password"
              required
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
            />
            <Button type="submit" fullWidth loading={loading}>
              Sign in
            </Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
```

- [ ] **Step 4: Write AcceptInvitationPage**

Write `packages/console-ui/src/pages/auth/AcceptInvitationPage.tsx`:

```typescript
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Container, Paper, Title, PasswordInput, Button, Text, Stack, Alert } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useAuth } from '@/stores/AuthContext';

export function AcceptInvitationPage() {
  const { acceptInvitation } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await acceptInvitation(token, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invitation failed');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <Container size={420} my={80}>
        <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
          Invalid invitation link. Please request a new invitation.
        </Alert>
      </Container>
    );
  }

  return (
    <Container size={420} my={80}>
      <Title ta="center" mb="lg">Set Your Password</Title>
      <Paper withBorder shadow="md" p={30} radius="md">
        <form onSubmit={handleSubmit}>
          <Stack>
            <Text size="sm" c="dimmed" ta="center">
              Create a password to activate your account
            </Text>
            {error && (
              <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
                {error}
              </Alert>
            )}
            <PasswordInput
              label="Password"
              placeholder="Min. 8 characters"
              required
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
            />
            <PasswordInput
              label="Confirm Password"
              placeholder="Re-enter password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.currentTarget.value)}
            />
            <Button type="submit" fullWidth loading={loading}>
              Activate Account
            </Button>
          </Stack>
        </form>
      </Paper>
    </Container>
  );
}
```

- [ ] **Step 5: Verify typecheck**

```bash
cd packages/console-ui && pnpm typecheck
```

Expected: No TypeScript errors. (The App.tsx references LoginPage and AcceptInvitationPage, now created.)

- [ ] **Step 6: Verify dev server renders login page**

```bash
cd packages/console-ui && pnpm dev
```

Open `http://localhost:5173` → should redirect to `/login` and show the login form.

- [ ] **Step 7: Commit**

```bash
git add packages/console-ui/src
git commit -m "feat: add auth types, API module, Login and AcceptInvitation pages"
```

---

## Task 4: Console API Stub Backend

**Files:**
- Create: `packages/console-api/src/index.ts`
- Create: `packages/console-api/src/fixtures.ts`

- [ ] **Step 1: Write fixtures with mock data**

Write `packages/console-api/src/fixtures.ts`:

```typescript
export const MOCK_USER = {
  id: 'usr_001',
  email: 'dev@ultralisk.com',
  name: 'Alice Developer',
  avatar_url: null,
  role: 'admin' as const,
  org_id: 'org_001',
  org_name: 'Ultralisk Labs',
  created_at: '2026-07-01T00:00:00Z',
};

export const MOCK_JWT = 'mock-jwt-token-for-development';

export const MOCK_MODELS = [
  {
    id: 'llama-3.3-70b-instruct',
    display_name: 'Llama 3.3 70B Instruct',
    author: 'Meta',
    category: 'chat',
    description: 'Meta\'s latest 70B parameter instruction-tuned model with strong reasoning capabilities.',
    capabilities: { context_window: 131072, max_output_tokens: 4096, json_mode: true, tool_calling: true, multi_modal: false, fine_tuning: false },
    pricing: { serverless: { input_per_1m_tokens: 0.59, output_per_1m_tokens: 0.79, cached_input_per_1m_tokens: 0.10 }, batch_discount_percent: 50 },
    deployment_types: ['serverless', 'dedicated'],
    status: 'available',
    version: 'fp8-quantized',
    featured: true,
    created_at: '2026-06-15T00:00:00Z',
  },
  {
    id: 'deepseek-v4-pro',
    display_name: 'DeepSeek V4 Pro',
    author: 'DeepSeek',
    category: 'chat',
    description: 'DeepSeek\'s most capable model with Mixture of Experts architecture and long context.',
    capabilities: { context_window: 262144, max_output_tokens: 8192, json_mode: true, tool_calling: true, multi_modal: false, fine_tuning: false },
    pricing: { serverless: { input_per_1m_tokens: 1.20, output_per_1m_tokens: 2.40 }, batch_discount_percent: 50 },
    deployment_types: ['serverless', 'dedicated'],
    status: 'available',
    version: 'bf16',
    featured: true,
    created_at: '2026-06-20T00:00:00Z',
  },
  {
    id: 'qwen-2.5-72b',
    display_name: 'Qwen 2.5 72B',
    author: 'Alibaba',
    category: 'chat',
    description: 'Alibaba\'s 72B model excelling at coding, math, and multilingual tasks.',
    capabilities: { context_window: 131072, max_output_tokens: 8192, json_mode: true, tool_calling: true, multi_modal: false, fine_tuning: true },
    pricing: { serverless: { input_per_1m_tokens: 0.90, output_per_1m_tokens: 0.90 }, batch_discount_percent: 50 },
    deployment_types: ['serverless'],
    status: 'available',
    version: 'fp8-quantized',
    featured: true,
    created_at: '2026-06-25T00:00:00Z',
  },
  {
    id: 'llama-3.1-8b-instruct',
    display_name: 'Llama 3.1 8B Instruct',
    author: 'Meta',
    category: 'chat',
    description: 'Fast and affordable 8B model for lightweight tasks and high-throughput applications.',
    capabilities: { context_window: 131072, max_output_tokens: 4096, json_mode: true, tool_calling: true, multi_modal: false, fine_tuning: true },
    pricing: { serverless: { input_per_1m_tokens: 0.06, output_per_1m_tokens: 0.06 }, batch_discount_percent: 50 },
    deployment_types: ['serverless'],
    status: 'available',
    version: 'fp8-quantized',
    featured: true,
    created_at: '2026-06-30T00:00:00Z',
  },
  {
    id: 'llama-3.2-vision-90b',
    display_name: 'Llama 3.2 Vision 90B',
    author: 'Meta',
    category: 'chat',
    description: 'Meta\'s multimodal vision-language model for image understanding and generation tasks.',
    capabilities: { context_window: 131072, max_output_tokens: 4096, json_mode: false, tool_calling: false, multi_modal: true, fine_tuning: false },
    pricing: { serverless: { input_per_1m_tokens: 1.50, output_per_1m_tokens: 3.00 }, batch_discount_percent: 50 },
    deployment_types: ['serverless'],
    status: 'available',
    version: 'fp16',
    featured: false,
    created_at: '2026-07-01T00:00:00Z',
  },
];

export const MODEL_DETAILS: Record<string, any> = {};
MOCK_MODELS.forEach((m) => {
  MODEL_DETAILS[m.id] = {
    ...m,
    usage_examples: {
      curl: `curl https://api.ultralisk.com/v1/chat/completions \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer $ULTRALISK_API_KEY" \\\n  -d '{"model":"${m.id}","messages":[{"role":"user","content":"Hello!"}]}'`,
      python: `from openai import OpenAI\n\nclient = OpenAI(\n  base_url="https://api.ultralisk.com/v1",\n  api_key="your-ultralisk-api-key"\n)\n\nresponse = client.chat.completions.create(\n  model="${m.id}",\n  messages=[{"role":"user","content":"Hello!"}]\n)\nprint(response.choices[0].message.content)`,
      typescript: `import OpenAI from 'openai';\n\nconst client = new OpenAI({\n  baseURL: 'https://api.ultralisk.com/v1',\n  apiKey: 'your-ultralisk-api-key',\n});\n\nconst response = await client.chat.completions.create({\n  model: '${m.id}',\n  messages: [{ role: 'user', content: 'Hello!' }],\n});\nconsole.log(response.choices[0].message.content);`,
    },
  };
});

export const MOCK_USAGE = {
  period: { from: '2026-07-01T00:00:00Z', to: '2026-07-10T23:59:59Z' },
  totals: { requests: 12450, input_tokens: 3_200_000, output_tokens: 890_000, cost_usd: 12.47 },
  by_model: [
    { model_id: 'llama-3.3-70b-instruct', model_display_name: 'Llama 3.3 70B', requests: 5200, input_tokens: 1_500_000, output_tokens: 400_000, cost_usd: 5.62 },
    { model_id: 'llama-3.1-8b-instruct', model_display_name: 'Llama 3.1 8B', requests: 6800, input_tokens: 1_600_000, output_tokens: 450_000, cost_usd: 6.84 },
  ],
  by_key: [
    { key_id: 'key_001', key_name: 'Production', key_prefix: 'ultr_...a1b', requests: 10000, input_tokens: 2_800_000, output_tokens: 750_000, cost_usd: 10.20 },
    { key_id: 'key_002', key_name: 'Development', key_prefix: 'ultr_...c2d', requests: 2450, input_tokens: 400_000, output_tokens: 140_000, cost_usd: 2.27 },
  ],
  recent_activity: Array.from({ length: 10 }, (_, i) => ({
    timestamp: new Date(Date.now() - i * 3600000).toISOString(),
    model_id: i % 2 === 0 ? 'llama-3.1-8b-instruct' : 'llama-3.3-70b-instruct',
    status_code: [200, 200, 200, 200, 200, 200, 200, 429, 500, 200][i],
    latency_ms: Math.floor(Math.random() * 500) + 100,
    tokens: Math.floor(Math.random() * 2000) + 100,
  })),
};

export const MOCK_BILLING = {
  balance_usd: 87.53,
  monthly_budget_usd: 100.00,
  month_to_date_spend_usd: 12.47,
  estimated_month_end_usd: 37.41,
  auto_recharge_enabled: true,
  invoices: [
    { id: 'inv_007', period: '2026-07', amount_usd: 12.47, status: 'pending' as const, download_url: '#', issued_at: '2026-07-01T00:00:00Z' },
    { id: 'inv_006', period: '2026-06', amount_usd: 45.20, status: 'paid' as const, download_url: '#', issued_at: '2026-06-01T00:00:00Z' },
    { id: 'inv_005', period: '2026-05', amount_usd: 32.80, status: 'paid' as const, download_url: '#', issued_at: '2026-05-01T00:00:00Z' },
  ],
};

export const MOCK_API_KEYS = [
  {
    id: 'key_001', name: 'Production', prefix: 'ultr_...a1b', role: 'admin' as const,
    model_allowlist: null, monthly_quota_usd: 50, usage_this_month_usd: 10.20,
    created_by: 'Alice Developer', created_at: '2026-07-01T00:00:00Z',
    last_used_at: '2026-07-10T14:30:00Z', revoked_at: null, status: 'active' as const,
  },
  {
    id: 'key_002', name: 'Development', prefix: 'ultr_...c2d', role: 'developer' as const,
    model_allowlist: ['llama-3.1-8b-instruct'], monthly_quota_usd: 25, usage_this_month_usd: 2.27,
    created_by: 'Alice Developer', created_at: '2026-07-03T00:00:00Z',
    last_used_at: '2026-07-10T12:15:00Z', revoked_at: null, status: 'active' as const,
  },
];
```

- [ ] **Step 2: Write Express stub server**

Write `packages/console-api/src/index.ts`:

```typescript
import express from 'express';
import cors from 'cors';
import {
  MOCK_USER, MOCK_JWT, MOCK_MODELS, MODEL_DETAILS,
  MOCK_USAGE, MOCK_BILLING, MOCK_API_KEYS,
} from './fixtures.js';

const app = express();
app.use(cors());
app.use(express.json());

// === Auth ===
app.post('/v1/admin/auth/login', (_req, res) => {
  res.json({ data: { user: MOCK_USER, jwt: MOCK_JWT } });
});

app.post('/v1/admin/auth/logout', (_req, res) => {
  res.status(200).json({ data: { ok: true } });
});

app.post('/v1/admin/auth/accept-invitation', (_req, res) => {
  res.json({ data: { user: MOCK_USER, jwt: MOCK_JWT } });
});

app.get('/v1/admin/auth/me', (_req, res) => {
  res.json({ data: MOCK_USER });
});

// === Invitations ===
app.post('/v1/admin/invitations', (_req, res) => {
  res.status(201).json({ data: { token: 'mock-invite-token-' + Date.now(), email: _req.body?.email ?? 'dev@example.com', expires_at: new Date(Date.now() + 7 * 86400000).toISOString() } });
});

app.get('/v1/admin/invitations', (_req, res) => {
  res.json({ data: [{ token: 'mock-invite-token-001', email: 'pending@example.com', status: 'pending', created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 86400000).toISOString() }] });
});

// === Models ===
app.get('/v1/admin/models', (_req, res) => {
  res.json({ data: MOCK_MODELS, pagination: { page: 1, limit: 20, total: MOCK_MODELS.length } });
});

app.get('/v1/admin/models/:id', (req, res) => {
  const model = MODEL_DETAILS[req.params.id];
  if (!model) return res.status(404).json({ error: { code: 'not_found', message: 'Model not found' } });
  res.json({ data: model });
});

// === Usage ===
app.get('/v1/admin/usage', (_req, res) => {
  res.json({ data: MOCK_USAGE });
});

// === Billing ===
app.get('/v1/admin/billing', (_req, res) => {
  res.json({ data: MOCK_BILLING });
});

// === API Keys ===
app.get('/v1/admin/api-keys', (_req, res) => {
  res.json({ data: MOCK_API_KEYS, pagination: { page: 1, limit: 20, total: MOCK_API_KEYS.length } });
});

app.post('/v1/admin/api-keys', (req, res) => {
  const body = req.body;
  const newKey = {
    id: `key_${Date.now()}`,
    name: body.name,
    prefix: 'ultr_...xyz',
    role: body.role,
    model_allowlist: body.model_allowlist ?? null,
    monthly_quota_usd: body.monthly_quota_usd ?? null,
    usage_this_month_usd: 0,
    created_by: MOCK_USER.name,
    created_at: new Date().toISOString(),
    last_used_at: null,
    revoked_at: null,
    status: 'active' as const,
    secret: `ultr_mock_${Date.now()}_secret`,
  };
  res.status(201).json({ data: newKey });
});

app.patch('/v1/admin/api-keys/:id', (req, res) => {
  res.json({ data: { ...MOCK_API_KEYS[0], ...req.body, id: req.params.id } });
});

app.delete('/v1/admin/api-keys/:id', (_req, res) => {
  res.status(204).send();
});

// === Chat completions (SSE stub) ===
app.post('/v1/chat/completions', (req, res) => {
  const { stream } = req.body;
  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const words = 'Hello! This is a mock streaming response from the Ultralisk Console stub API. You can use this to test the Playground UI.'.split(' ');
    let i = 0;
    const interval = setInterval(() => {
      if (i >= words.length) {
        res.write(`data: {"id":"chatcmpl-mock","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        clearInterval(interval);
        return;
      }
      res.write(`data: {"id":"chatcmpl-mock","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"${words[i]} "},"finish_reason":null}]}\n\n`);
      i++;
    }, 80);
    req.on('close', () => clearInterval(interval));
  } else {
    res.json({
      id: 'chatcmpl-mock',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: req.body.model ?? 'llama-3.1-8b-instruct',
      choices: [{ index: 0, message: { role: 'assistant', content: 'Hello! This is a mock response from the Ultralisk Console stub API.' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
    });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Ultralisk Console API stub running on http://localhost:${PORT}`);
});
```

- [ ] **Step 3: Verify API stub starts**

```bash
cd packages/console-api && pnpm dev
```

Expected: `Ultralisk Console API stub running on http://localhost:3001`

- [ ] **Step 4: Test a few endpoints**

```bash
curl http://localhost:3001/v1/admin/models | head -c 200
curl -X POST http://localhost:3001/v1/admin/auth/login -H 'Content-Type: application/json' -d '{}' | head -c 200
```

Expected: Both return valid JSON with `data` wrapper.

- [ ] **Step 5: Commit**

```bash
git add packages/console-api/src
git commit -m "feat: add console-api Express stub with mock fixtures for all Phase 1a endpoints"
```

---

## Task 5: Dashboard Page

**Files:**
- Create: `packages/console-ui/src/pages/dashboard/DashboardPage.tsx`
- Create: `packages/console-ui/src/components/dashboard/AccountStatusBanner.tsx`
- Create: `packages/console-ui/src/components/dashboard/DeveloperQuickstart.tsx`
- Create: `packages/console-ui/src/components/dashboard/UsageSummaryCards.tsx`
- Create: `packages/console-ui/src/components/dashboard/QuickActions.tsx`
- Create: `packages/console-ui/src/components/dashboard/RecentActivity.tsx`
- Create: `packages/console-ui/src/components/dashboard/ExamplesResources.tsx`
- Create: `packages/console-ui/src/api/usage.ts`
- Create: `packages/console-ui/src/hooks/useUsage.ts`
- Create: `packages/console-ui/src/hooks/useBilling.ts`
- Create: `packages/console-ui/src/api/billing.ts`
- Create: `packages/console-ui/src/utils/format.ts`

- [ ] **Step 1: Write utility formatters**

Write `packages/console-ui/src/utils/format.ts`:

```typescript
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
```

- [ ] **Step 2: Write usage and billing API + hooks**

Write `packages/console-ui/src/api/usage.ts`:

```typescript
import { apiFetch } from './client';
import type { SingleResponse, UsageSummary } from '@/types';

export async function getUsage(range = 'today') {
  return apiFetch<SingleResponse<UsageSummary>>(`/v1/admin/usage?range=${range}`);
}
```

Write `packages/console-ui/src/api/billing.ts`:

```typescript
import { apiFetch } from './client';
import type { SingleResponse, Billing } from '@/types';

export async function getBilling() {
  return apiFetch<SingleResponse<Billing>>('/v1/admin/billing');
}
```

Write `packages/console-ui/src/hooks/useUsage.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { getUsage } from '@/api/usage';

export function useUsage(range = 'today') {
  return useQuery({
    queryKey: ['usage', range],
    queryFn: () => getUsage(range).then((r) => r.data),
    refetchInterval: 30_000,
  });
}
```

Write `packages/console-ui/src/hooks/useBilling.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { getBilling } from '@/api/billing';

export function useBilling() {
  return useQuery({
    queryKey: ['billing'],
    queryFn: () => getBilling().then((r) => r.data),
    refetchInterval: 60_000,
  });
}
```

- [ ] **Step 3: Write AccountStatusBanner**

Write `packages/console-ui/src/components/dashboard/AccountStatusBanner.tsx`:

```typescript
import { Alert, Group, Text, Button } from '@mantine/core';
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { useBilling } from '@/hooks/useBilling';
import { formatCurrency } from '@/utils/format';
import { useNavigate } from 'react-router-dom';

export function AccountStatusBanner() {
  const { data: billing, isLoading } = useBilling();
  const navigate = useNavigate();

  if (isLoading || !billing) return null;

  if (billing.balance_usd <= 0) {
    return (
      <Alert color="yellow" icon={<IconAlertTriangle size={20} />} mb="md">
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm">Make an initial deposit to start using the API.</Text>
          <Button size="xs" variant="filled" onClick={() => navigate('/billing')}>
            Add Funds
          </Button>
        </Group>
      </Alert>
    );
  }

  const pctUsed = billing.monthly_budget_usd
    ? ((billing.month_to_date_spend_usd / billing.monthly_budget_usd) * 100).toFixed(0)
    : null;

  return (
    <Alert color="green" icon={<IconCheck size={20} />} mb="md">
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm">
          Balance: {formatCurrency(billing.balance_usd)}
          {pctUsed && ` · MTD: ${formatCurrency(billing.month_to_date_spend_usd)} (${pctUsed}% of budget)`}
        </Text>
      </Group>
    </Alert>
  );
}
```

- [ ] **Step 4: Write DeveloperQuickstart**

Write `packages/console-ui/src/components/dashboard/DeveloperQuickstart.tsx`:

```typescript
import { useState } from 'react';
import { Paper, Title, SegmentedControl, Code, CopyButton, ActionIcon, Group, Text } from '@mantine/core';
import { IconCopy, IconCheck } from '@tabler/icons-react';

const SNIPPETS: Record<string, string> = {
  curl: `curl https://api.ultralisk.com/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $ULTRALISK_API_KEY" \\
  -d '{
    "model": "llama-3.1-8b-instruct",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`,
  python: `from openai import OpenAI

client = OpenAI(
    base_url="https://api.ultralisk.com/v1",
    api_key="your-api-key"
)

response = client.chat.completions.create(
    model="llama-3.1-8b-instruct",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)`,
  typescript: `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://api.ultralisk.com/v1',
  apiKey: 'your-api-key',
});

const response = await client.chat.completions.create({
  model: 'llama-3.1-8b-instruct',
  messages: [{ role: 'user', content: 'Hello!' }],
});
console.log(response.choices[0].message.content);`,
};

export function DeveloperQuickstart() {
  const [tab, setTab] = useState('python');

  return (
    <Paper withBorder p="lg" radius="md" mb="md">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Developer Quickstart</Title>
        <SegmentedControl
          size="xs"
          data={[
            { label: 'Python', value: 'python' },
            { label: 'TypeScript', value: 'typescript' },
            { label: 'curl', value: 'curl' },
          ]}
          value={tab}
          onChange={setTab as (v: string) => void}
        />
      </Group>
      <Paper withBorder p="sm" bg="var(--mantine-color-dark-8)" style={{ position: 'relative' }}>
        <CopyButton value={SNIPPETS[tab]} timeout={2000}>
          {({ copied, copy }) => (
            <ActionIcon
              color={copied ? 'teal' : 'gray'}
              variant="subtle"
              onClick={copy}
              style={{ position: 'absolute', top: 8, right: 8 }}
            >
              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            </ActionIcon>
          )}
        </CopyButton>
        <Code block style={{ background: 'transparent' }}>
          {SNIPPETS[tab]}
        </Code>
      </Paper>
    </Paper>
  );
}
```

- [ ] **Step 5: Write UsageSummaryCards**

Write `packages/console-ui/src/components/dashboard/UsageSummaryCards.tsx`:

```typescript
import { SimpleGrid, Paper, Text, Group, Skeleton } from '@mantine/core';
import { IconArrowsExchange, IconCoins, IconCash, IconWallet } from '@tabler/icons-react';
import { useUsage } from '@/hooks/useUsage';
import { useBilling } from '@/hooks/useBilling';
import { formatNumber, formatTokens, formatCurrency } from '@/utils/format';

export function UsageSummaryCards() {
  const { data: usage, isLoading: usageLoading } = useUsage();
  const { data: billing, isLoading: billingLoading } = useBilling();
  const loading = usageLoading || billingLoading;

  const cards = [
    {
      label: 'Today\'s Requests',
      value: usage ? formatNumber(usage.totals.requests) : '-',
      icon: IconArrowsExchange,
      color: 'blue',
    },
    {
      label: 'Today\'s Tokens',
      value: usage ? formatTokens(usage.totals.input_tokens + usage.totals.output_tokens) : '-',
      icon: IconCoins,
      color: 'violet',
    },
    {
      label: 'Today\'s Cost',
      value: usage ? formatCurrency(usage.totals.cost_usd) : '-',
      icon: IconCash,
      color: 'green',
    },
    {
      label: 'Balance',
      value: billing ? formatCurrency(billing.balance_usd) : '-',
      icon: IconWallet,
      color: 'orange',
    },
  ];

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="md">
      {cards.map((card) => (
        <Paper withBorder p="md" radius="md" key={card.label}>
          {loading ? (
            <Skeleton height={50} />
          ) : (
            <Group>
              <card.icon size={24} color={`var(--mantine-color-${card.color}-6)`} />
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>{card.label}</Text>
                <Text fw={700} size="lg">{card.value}</Text>
              </div>
            </Group>
          )}
        </Paper>
      ))}
    </SimpleGrid>
  );
}
```

- [ ] **Step 6: Write QuickActions**

Write `packages/console-ui/src/components/dashboard/QuickActions.tsx`:

```typescript
import { SimpleGrid, Paper, Text, ThemeIcon, Group } from '@mantine/core';
import { IconKey, IconBook, IconBox, IconMessage } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';

const ACTIONS = [
  { label: 'Manage API Keys', icon: IconKey, path: '/api-keys', color: 'blue' },
  { label: 'API Reference', icon: IconBook, path: 'https://docs.ultralisk.com', color: 'violet', external: true },
  { label: 'Explore Models', icon: IconBox, path: '/models', color: 'green' },
  { label: 'Open Playground', icon: IconMessage, path: '/playground', color: 'orange' },
];

export function QuickActions() {
  const navigate = useNavigate();

  return (
    <>
      <Text size="sm" fw={500} mb="xs">Quick Actions</Text>
      <SimpleGrid cols={{ base: 2, sm: 4 }} mb="md">
        {ACTIONS.map((action) => (
          <Paper
            key={action.label}
            withBorder
            p="md"
            radius="md"
            style={{ cursor: 'pointer' }}
            onClick={() => action.external ? window.open(action.path, '_blank') : navigate(action.path)}
          >
            <Group>
              <ThemeIcon variant="light" color={action.color} size="lg">
                <action.icon size={20} />
              </ThemeIcon>
              <Text size="sm" fw={500}>{action.label}</Text>
            </Group>
          </Paper>
        ))}
      </SimpleGrid>
    </>
  );
}
```

- [ ] **Step 7: Write RecentActivity**

Write `packages/console-ui/src/components/dashboard/RecentActivity.tsx`:

```typescript
import { Paper, Text, Table, Badge, Group } from '@mantine/core';
import { useUsage } from '@/hooks/useUsage';
import { formatRelativeTime } from '@/utils/format';

export function RecentActivity() {
  const { data: usage, isLoading } = useUsage();

  if (isLoading || !usage?.recent_activity?.length) return null;

  return (
    <Paper withBorder p="lg" radius="md" mb="md">
      <Text size="sm" fw={500} mb="sm">Recent Activity</Text>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Time</Table.Th>
            <Table.Th>Model</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Latency</Table.Th>
            <Table.Th>Tokens</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {usage.recent_activity.slice(0, 10).map((item, i) => (
            <Table.Tr key={i}>
              <Table.Td>{formatRelativeTime(item.timestamp)}</Table.Td>
              <Table.Td>{item.model_id}</Table.Td>
              <Table.Td>
                <Badge color={item.status_code < 400 ? 'green' : item.status_code < 500 ? 'yellow' : 'red'} variant="light">
                  {item.status_code}
                </Badge>
              </Table.Td>
              <Table.Td>{item.latency_ms}ms</Table.Td>
              <Table.Td>{item.tokens}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}
```

- [ ] **Step 8: Write ExamplesResources**

Write `packages/console-ui/src/components/dashboard/ExamplesResources.tsx`:

```typescript
import { SimpleGrid, Paper, Text, ThemeIcon } from '@mantine/core';
import { IconRobot, IconDatabase, IconBrain, IconFileText } from '@tabler/icons-react';

const EXAMPLES = [
  { title: 'Build a Chatbot', description: 'Create a conversational AI with context and memory', icon: IconRobot, color: 'violet' },
  { title: 'RAG Application', description: 'Retrieval-augmented generation with your own data', icon: IconDatabase, color: 'blue' },
  { title: 'AI Agent', description: 'Build agents with tool calling and function execution', icon: IconBrain, color: 'green' },
  { title: 'Structured Output', description: 'Extract structured JSON from unstructured text', icon: IconFileText, color: 'orange' },
];

export function ExamplesResources() {
  return (
    <>
      <Text size="sm" fw={500} mb="xs">Examples &amp; Resources</Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }} mb="md">
        {EXAMPLES.map((ex) => (
          <Paper key={ex.title} withBorder p="md" radius="md" style={{ cursor: 'pointer' }}>
            <ThemeIcon variant="light" color={ex.color} size="lg" mb="sm">
              <ex.icon size={20} />
            </ThemeIcon>
            <Text fw={500} size="sm">{ex.title}</Text>
            <Text size="xs" c="dimmed">{ex.description}</Text>
          </Paper>
        ))}
      </SimpleGrid>
    </>
  );
}
```

- [ ] **Step 9: Write DashboardPage**

Write `packages/console-ui/src/pages/dashboard/DashboardPage.tsx`:

```typescript
import { Title } from '@mantine/core';
import { AccountStatusBanner } from '@/components/dashboard/AccountStatusBanner';
import { DeveloperQuickstart } from '@/components/dashboard/DeveloperQuickstart';
import { UsageSummaryCards } from '@/components/dashboard/UsageSummaryCards';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { ExamplesResources } from '@/components/dashboard/ExamplesResources';

export function DashboardPage() {
  return (
    <>
      <Title order={2} mb="md">Dashboard</Title>
      <AccountStatusBanner />
      <DeveloperQuickstart />
      <UsageSummaryCards />
      <QuickActions />
      <RecentActivity />
      <ExamplesResources />
    </>
  );
}
```

- [ ] **Step 10: Add Dashboard route to App**

Edit `packages/console-ui/src/App.tsx` — add import and route inside the ConsoleLayout `<Route>`:

```typescript
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
```

Add inside the ConsoleLayout route element:

```typescript
<Route path="/dashboard" element={<DashboardPage />} />
```

- [ ] **Step 11: Verify typecheck and dev server**

```bash
cd packages/console-ui && pnpm typecheck
```

Expected: No errors.

Start API stub (`cd packages/console-api && pnpm dev`), then start UI (`cd packages/console-ui && pnpm dev`), open `http://localhost:5173/login`, log in with any credentials (stub accepts all). Should redirect to dashboard with all sections visible.

- [ ] **Step 12: Commit**

```bash
git add packages/console-ui/src
git commit -m "feat: add Dashboard page with account banner, quickstart, usage cards, activity, and examples"
```

---

## Task 6: Models Page

**Files:**
- Create: `packages/console-ui/src/api/models.ts`
- Create: `packages/console-ui/src/hooks/useModels.ts`
- Create: `packages/console-ui/src/components/models/FeaturedModels.tsx`
- Create: `packages/console-ui/src/components/models/ModelsTable.tsx`
- Create: `packages/console-ui/src/components/models/ModelFilters.tsx`
- Create: `packages/console-ui/src/pages/models/ModelsPage.tsx`
- Create: `packages/console-ui/src/pages/models/ModelDetailPage.tsx`

- [ ] **Step 1: Write models API + hook**

Write `packages/console-ui/src/api/models.ts`:

```typescript
import { apiFetch } from './client';
import type { PaginatedResponse, SingleResponse, Model, ModelDetail } from '@/types';

export async function getModels(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<PaginatedResponse<Model>>(`/v1/admin/models${qs}`);
}

export async function getModel(id: string) {
  return apiFetch<SingleResponse<ModelDetail>>(`/v1/admin/models/${id}`);
}
```

Write `packages/console-ui/src/hooks/useModels.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { getModels, getModel } from '@/api/models';

export function useModels(filters?: Record<string, string>) {
  return useQuery({
    queryKey: ['models', filters],
    queryFn: () => getModels(filters).then((r) => r.data),
  });
}

export function useModel(id: string) {
  return useQuery({
    queryKey: ['models', id],
    queryFn: () => getModel(id).then((r) => r.data),
    enabled: !!id,
  });
}
```

- [ ] **Step 2: Write FeaturedModels**

Write `packages/console-ui/src/components/models/FeaturedModels.tsx`:

```typescript
import { SimpleGrid, Paper, Text, Badge, Group, Button, Skeleton, Stack } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { useModels } from '@/hooks/useModels';
import { formatCurrency } from '@/utils/format';
import type { Model } from '@/types';

function FeaturedCard({ model }: { model: Model }) {
  const navigate = useNavigate();
  return (
    <Paper withBorder p="lg" radius="md">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Text fw={600} size="sm" lineClamp={1}>{model.display_name}</Text>
          <Badge variant="light" size="xs">{model.author}</Badge>
        </Group>
        <Group gap={4}>
          {model.capabilities.json_mode && <Badge variant="outline" size="xs">JSON</Badge>}
          {model.capabilities.tool_calling && <Badge variant="outline" size="xs">Tools</Badge>}
          {model.capabilities.multi_modal && <Badge variant="outline" size="xs">Vision</Badge>}
          {model.capabilities.fine_tuning && <Badge variant="outline" size="xs">FT</Badge>}
        </Group>
        <Text size="xs" c="dimmed">
          {formatCurrency(model.pricing.serverless.input_per_1m_tokens)} / {formatCurrency(model.pricing.serverless.output_per_1m_tokens)} per 1M tokens
        </Text>
        <Group>
          <Button size="xs" variant="light" onClick={() => navigate(`/playground?model=${model.id}`)}>
            Open in Playground
          </Button>
          <Button size="xs" variant="subtle" onClick={() => navigate(`/models/${model.id}`)}>
            View Details
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

export function FeaturedModels() {
  const { data: models, isLoading } = useModels();

  if (isLoading) {
    return (
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="md">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={160} radius="md" />)}
      </SimpleGrid>
    );
  }

  const featured = (models ?? []).filter((m) => m.featured);

  return (
    <>
      <Text size="sm" fw={500} mb="xs">Featured Models</Text>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="lg">
        {featured.map((m) => <FeaturedCard key={m.id} model={m} />)}
      </SimpleGrid>
    </>
  );
}
```

- [ ] **Step 3: Write ModelFilters**

Write `packages/console-ui/src/components/models/ModelFilters.tsx`:

```typescript
import { Group, SegmentedControl, Text } from '@mantine/core';

interface Props {
  filters: { deployment?: string; category?: string; feature?: string };
  onChange: (f: Props['filters']) => void;
}

export function ModelFilters({ filters, onChange }: Props) {
  return (
    <Group mb="md" gap="lg">
      <div>
        <Text size="xs" fw={500} c="dimmed" mb={4}>Deployment</Text>
        <SegmentedControl
          size="xs"
          data={[
            { label: 'All', value: '' },
            { label: 'Serverless', value: 'serverless' },
            { label: 'Dedicated', value: 'dedicated' },
          ]}
          value={filters.deployment ?? ''}
          onChange={(v) => onChange({ ...filters, deployment: v })}
        />
      </div>
      <div>
        <Text size="xs" fw={500} c="dimmed" mb={4}>Category</Text>
        <SegmentedControl
          size="xs"
          data={[
            { label: 'All', value: '' },
            { label: 'Chat', value: 'chat' },
            { label: 'Embedding', value: 'embedding' },
            { label: 'Vision', value: 'image' },
          ]}
          value={filters.category ?? ''}
          onChange={(v) => onChange({ ...filters, category: v })}
        />
      </div>
      <div>
        <Text size="xs" fw={500} c="dimmed" mb={4}>Features</Text>
        <SegmentedControl
          size="xs"
          data={[
            { label: 'All', value: '' },
            { label: 'JSON Mode', value: 'json_mode' },
            { label: 'Tool Calling', value: 'tool_calling' },
            { label: 'Multi-Modal', value: 'multi_modal' },
          ]}
          value={filters.feature ?? ''}
          onChange={(v) => onChange({ ...filters, feature: v })}
        />
      </div>
    </Group>
  );
}
```

- [ ] **Step 4: Write ModelsTable**

Write `packages/console-ui/src/components/models/ModelsTable.tsx`:

```typescript
import { Table, Badge, Group, ActionIcon, Skeleton, Text } from '@mantine/core';
import { IconPlayerPlay, IconFileText } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useModels } from '@/hooks/useModels';
import { formatCurrency } from '@/utils/format';
import type { Model } from '@/types';

export function ModelsTable({ filters }: { filters: Record<string, string> }) {
  const { data: models, isLoading } = useModels(filters);
  const navigate = useNavigate();

  const rows = (models ?? []).map((m: Model) => (
    <Table.Tr key={m.id}>
      <Table.Td>
        <Text fw={500} size="sm">{m.display_name}</Text>
        <Text size="xs" c="dimmed">{m.id}</Text>
      </Table.Td>
      <Table.Td>{m.author}</Table.Td>
      <Table.Td><Badge variant="light" size="sm">{m.category}</Badge></Table.Td>
      <Table.Td>
        <Text size="sm">{formatCurrency(m.pricing.serverless.input_per_1m_tokens)} / {formatCurrency(m.pricing.serverless.output_per_1m_tokens)}</Text>
        <Text size="xs" c="dimmed">per 1M tokens</Text>
      </Table.Td>
      <Table.Td>
        {m.pricing.batch_discount_percent && (
          <Badge variant="outline" size="xs" color="green">{m.pricing.batch_discount_percent}% off batch</Badge>
        )}
      </Table.Td>
      <Table.Td>
        <Badge color={m.status === 'available' ? 'green' : m.status === 'degraded' ? 'yellow' : 'red'} variant="dot" size="sm">
          {m.status}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Group gap={4}>
          <ActionIcon variant="light" size="sm" onClick={() => navigate(`/playground?model=${m.id}`)} title="Open in Playground">
            <IconPlayerPlay size={14} />
          </ActionIcon>
          <ActionIcon variant="light" size="sm" onClick={() => navigate(`/models/${m.id}`)} title="View Details">
            <IconFileText size={14} />
          </ActionIcon>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Text size="sm" fw={500} mb="xs">Browse Models</Text>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Model</Table.Th>
            <Table.Th>Author</Table.Th>
            <Table.Th>Category</Table.Th>
            <Table.Th>Serverless Pricing</Table.Th>
            <Table.Th>Batch</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <Table.Tr key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <Table.Td key={j}><Skeleton height={20} /></Table.Td>
                  ))}
                </Table.Tr>
              ))
            : rows}
        </Table.Tbody>
      </Table>
    </>
  );
}
```

- [ ] **Step 5: Write ModelsPage**

Write `packages/console-ui/src/pages/models/ModelsPage.tsx`:

```typescript
import { useState } from 'react';
import { Title } from '@mantine/core';
import { FeaturedModels } from '@/components/models/FeaturedModels';
import { ModelFilters } from '@/components/models/ModelFilters';
import { ModelsTable } from '@/components/models/ModelsTable';

export function ModelsPage() {
  const [filters, setFilters] = useState<Record<string, string>>({});

  const apiFilters: Record<string, string> = {};
  if (filters.deployment) apiFilters.deployment = filters.deployment;
  if (filters.category) apiFilters.category = filters.category;

  return (
    <>
      <Title order={2} mb="md">Models</Title>
      <FeaturedModels />
      <ModelFilters filters={filters} onChange={setFilters} />
      <ModelsTable filters={apiFilters} />
    </>
  );
}
```

- [ ] **Step 6: Write ModelDetailPage**

Write `packages/console-ui/src/pages/models/ModelDetailPage.tsx`:

```typescript
import { useParams, useNavigate } from 'react-router-dom';
import { Title, Paper, Text, Badge, Group, Stack, Code, Button, Skeleton, SimpleGrid } from '@mantine/core';
import { IconArrowLeft, IconPlayerPlay } from '@tabler/icons-react';
import { useModel } from '@/hooks/useModels';
import { formatCurrency } from '@/utils/format';

export function ModelDetailPage() {
  const { modelId } = useParams<{ modelId: string }>();
  const navigate = useNavigate();
  const { data: model, isLoading } = useModel(modelId ?? '');

  if (isLoading) return <Skeleton height={400} />;
  if (!model) return <Text c="red">Model not found</Text>;

  return (
    <>
      <Group mb="md">
        <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/models')}>
          Back to Models
        </Button>
      </Group>
      <Title order={2} mb="xs">{model.display_name}</Title>
      <Text c="dimmed" mb="md">{model.description}</Text>

      <SimpleGrid cols={{ base: 1, md: 2 }} mb="lg">
        <Paper withBorder p="lg" radius="md">
          <Title order={4} mb="sm">Capabilities</Title>
          <Stack gap="xs">
            <Group><Text size="sm" fw={500}>Context Window:</Text><Text size="sm">{model.capabilities.context_window.toLocaleString()} tokens</Text></Group>
            <Group><Text size="sm" fw={500}>Max Output:</Text><Text size="sm">{model.capabilities.max_output_tokens.toLocaleString()} tokens</Text></Group>
            <Group gap={4}>
              <Text size="sm" fw={500}>Features:</Text>
              {model.capabilities.json_mode && <Badge size="xs" variant="light">JSON Mode</Badge>}
              {model.capabilities.tool_calling && <Badge size="xs" variant="light">Tool Calling</Badge>}
              {model.capabilities.multi_modal && <Badge size="xs" variant="light">Multi-Modal</Badge>}
              {model.capabilities.fine_tuning && <Badge size="xs" variant="light">Fine-Tuning</Badge>}
            </Group>
            <Group><Text size="sm" fw={500}>Version:</Text><Badge size="xs" variant="outline">{model.version}</Badge></Group>
          </Stack>
        </Paper>

        <Paper withBorder p="lg" radius="md">
          <Title order={4} mb="sm">Pricing</Title>
          <Stack gap="xs">
            <Group><Text size="sm" fw={500}>Input:</Text><Text size="sm">{formatCurrency(model.pricing.serverless.input_per_1m_tokens)} / 1M tokens</Text></Group>
            <Group><Text size="sm" fw={500}>Output:</Text><Text size="sm">{formatCurrency(model.pricing.serverless.output_per_1m_tokens)} / 1M tokens</Text></Group>
            {model.pricing.serverless.cached_input_per_1m_tokens && (
              <Group><Text size="sm" fw={500}>Cached Input:</Text><Text size="sm">{formatCurrency(model.pricing.serverless.cached_input_per_1m_tokens)} / 1M tokens</Text></Group>
            )}
            {model.pricing.batch_discount_percent && (
              <Group><Text size="sm" fw={500}>Batch Discount:</Text><Badge color="green">{model.pricing.batch_discount_percent}% off</Badge></Group>
            )}
            {model.pricing.dedicated && (
              <Group><Text size="sm" fw={500}>Dedicated:</Text><Text size="sm">{model.pricing.dedicated.gpu_type} @ {formatCurrency(model.pricing.dedicated.price_per_hour)}/hr</Text></Group>
            )}
          </Stack>
        </Paper>
      </SimpleGrid>

      <Paper withBorder p="lg" radius="md" mb="md">
        <Title order={4} mb="sm">Quick Start</Title>
        <Text size="xs" c="dimmed" mb="sm">Use with OpenAI-compatible SDKs:</Text>
        <Code block mb="sm">{model.usage_examples.python}</Code>
      </Paper>

      <Button leftSection={<IconPlayerPlay size={16} />} onClick={() => navigate(`/playground?model=${model.id}`)}>
        Open in Playground
      </Button>
    </>
  );
}
```

- [ ] **Step 7: Add Models routes to App**

Edit `packages/console-ui/src/App.tsx` — add imports and routes:

```typescript
import { ModelsPage } from '@/pages/models/ModelsPage';
import { ModelDetailPage } from '@/pages/models/ModelDetailPage';
```

Add routes:

```typescript
<Route path="/models" element={<ModelsPage />} />
<Route path="/models/:modelId" element={<ModelDetailPage />} />
```

- [ ] **Step 8: Verify typecheck**

```bash
cd packages/console-ui && pnpm typecheck
```

Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add packages/console-ui/src
git commit -m "feat: add Models page with featured cards, filters, table, and detail page"
```

---

## Task 7: Playground — Core Chat & Streaming

**Files:**
- Create: `packages/console-ui/src/api/chat.ts`
- Create: `packages/console-ui/src/hooks/usePlaygroundChat.ts`
- Create: `packages/console-ui/src/hooks/usePlaygroundSession.ts`
- Create: `packages/console-ui/src/utils/storage.ts`
- Create: `packages/console-ui/src/components/playground/ModelSelector.tsx`
- Create: `packages/console-ui/src/components/playground/ChatArea.tsx`
- Create: `packages/console-ui/src/components/playground/MessageBubble.tsx`
- Create: `packages/console-ui/src/components/playground/ChatInput.tsx`
- Create: `packages/console-ui/src/pages/playground/PlaygroundPage.tsx`

- [ ] **Step 1: Write storage helpers**

Write `packages/console-ui/src/utils/storage.ts`:

```typescript
import type { PlaygroundSession } from '@/types';

const SESSIONS_KEY = 'ultralisk_playground_sessions';

export function getSessions(): PlaygroundSession[] {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function saveSessions(sessions: PlaygroundSession[]): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function getSession(id: string): PlaygroundSession | undefined {
  return getSessions().find((s) => s.id === id);
}

export function saveSession(session: PlaygroundSession): void {
  const sessions = getSessions().filter((s) => s.id !== session.id);
  sessions.push(session);
  saveSessions(sessions);
}

export function deleteSession(id: string): void {
  saveSessions(getSessions().filter((s) => s.id !== id));
}
```

- [ ] **Step 2: Write chat API with SSE streaming**

Write `packages/console-ui/src/api/chat.ts`:

```typescript
import type { ChatMessage } from '@/types';

export function streamChat(
  model: string,
  messages: ChatMessage[],
  params: Record<string, unknown>,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: Error) => void,
): AbortController {
  const controller = new AbortController();

  fetch('/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      ...params,
    }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message ?? `HTTP ${res.status}`);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') { onDone(); return; }
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) onToken(content);
            if (parsed.choices?.[0]?.finish_reason) onDone();
          } catch { /* skip malformed chunks */ }
        }
      }
      onDone();
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError(err);
    });

  return controller;
}
```

- [ ] **Step 3: Write usePlaygroundSession hook**

Write `packages/console-ui/src/hooks/usePlaygroundSession.ts`:

```typescript
import { useState, useCallback } from 'react';
import type { PlaygroundSession, ChatMessage } from '@/types';
import { getSessions, saveSession, deleteSession } from '@/utils/storage';

function generateId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function usePlaygroundSession(initialModelId = 'llama-3.1-8b-instruct') {
  const [sessions, setSessions] = useState<PlaygroundSession[]>(getSessions);
  const [activeId, setActiveId] = useState<string>(() => {
    const first = getSessions()[0];
    return first?.id ?? '';
  });

  const activeSession = sessions.find((s) => s.id === activeId);

  const createSession = useCallback((modelId = initialModelId) => {
    const session: PlaygroundSession = {
      id: generateId(),
      name: 'New Chat',
      modelId,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setSessions((prev) => [...prev, session]);
    setActiveId(session.id);
    saveSession(session);
    return session;
  }, [initialModelId]);

  const addMessage = useCallback((sessionId: string, msg: ChatMessage) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        const updated = { ...s, messages: [...s.messages, msg], updatedAt: new Date().toISOString() };
        saveSession(updated);
        return updated;
      })
    );
  }, []);

  const updateLastAssistant = useCallback((sessionId: string, content: string) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        const msgs = [...s.messages];
        if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
          msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content };
        } else {
          msgs.push({ role: 'assistant', content });
        }
        const updated = { ...s, messages: msgs, updatedAt: new Date().toISOString() };
        saveSession(updated);
        return updated;
      })
    );
  }, []);

  const renameSession = useCallback((sessionId: string, name: string) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        const updated = { ...s, name };
        saveSession(updated);
        return updated;
      })
    );
  }, []);

  const removeSession = useCallback((sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    deleteSession(sessionId);
    if (sessionId === activeId) {
      setActiveId((prev) => {
        const remaining = getSessions();
        return remaining.length > 0 ? remaining[0].id : '';
      });
    }
  }, [activeId]);

  const changeModel = useCallback((sessionId: string, modelId: string) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        const updated = { ...s, modelId };
        saveSession(updated);
        return updated;
      })
    );
  }, []);

  return {
    sessions, activeId, activeSession,
    setActiveId, createSession, addMessage,
    updateLastAssistant, renameSession, removeSession,
    changeModel,
  };
}
```

- [ ] **Step 4: Write usePlaygroundChat hook**

Write `packages/console-ui/src/hooks/usePlaygroundChat.ts`:

```typescript
import { useState, useCallback, useRef } from 'react';
import { streamChat } from '@/api/chat';

export function usePlaygroundChat() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    (
      model: string,
      messages: { role: string; content: string }[],
      params: Record<string, unknown>,
      onToken: (token: string) => void,
      onDone: () => void,
      onError: (err: string) => void,
    ) => {
      setIsStreaming(true);
      setError(null);
      setErrorType(null);
      setRetryAfter(null);

      abortRef.current = streamChat(
        model,
        messages,
        params,
        onToken,
        () => { setIsStreaming(false); onDone(); },
        (err) => {
          setIsStreaming(false);
          const msg = err.message;
          setError(msg);
          // Determine error type for UI state
          if (msg.includes('429') || msg.includes('rate')) {
            setErrorType('rate_limit');
            setRetryAfter(15);
          } else if (msg.includes('timeout') || msg.includes('abort')) {
            setErrorType('timeout');
          } else {
            setErrorType('general');
          }
          onError(msg);
        },
      );
    },
    [],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  return { send, cancel, isStreaming, error, errorType, retryAfter };
}
```

- [ ] **Step 5: Write ModelSelector**

Write `packages/console-ui/src/components/playground/ModelSelector.tsx`:

```typescript
import { Select, Badge, Group, Text } from '@mantine/core';
import { useModels } from '@/hooks/useModels';
import type { Model } from '@/types';

interface Props {
  value: string;
  onChange: (modelId: string) => void;
}

export function ModelSelector({ value, onChange }: Props) {
  const { data: models } = useModels();

  const options = (models ?? []).map((m: Model) => ({
    value: m.id,
    label: m.display_name,
    disabled: m.status !== 'available',
    rightSection: m.status !== 'available'
      ? m.status === 'degraded' ? 'Degraded' : 'Unavailable'
      : undefined,
  }));

  const selectedModel = models?.find((m) => m.id === value);

  return (
    <Group gap="xs">
      <Select
        data={options}
        value={value}
        onChange={(v) => v && onChange(v)}
        searchable
        placeholder="Select a model"
        style={{ minWidth: 280 }}
        renderOption={({ option }) => (
          <Group>
            <Text size="sm">{option.label}</Text>
            {option.disabled && <Badge size="xs" color="red" variant="light">{option.rightSection}</Badge>}
          </Group>
        )}
      />
      {selectedModel && selectedModel.status !== 'available' && (
        <Badge color="red" variant="light">
          {selectedModel.status === 'degraded' ? 'Degraded — try another model' : 'Unavailable'}
        </Badge>
      )}
    </Group>
  );
}
```

- [ ] **Step 6: Write MessageBubble**

Write `packages/console-ui/src/components/playground/MessageBubble.tsx`:

```typescript
import { Paper, Text, Group, ActionIcon, CopyButton, Tooltip } from '@mantine/core';
import { IconCopy, IconCheck, IconEdit, IconRefresh } from '@tabler/icons-react';
import ReactMarkdown from 'react-markdown';

interface Props {
  role: 'user' | 'assistant' | 'system';
  content: string;
  onEdit?: () => void;
  onRegenerate?: () => void;
}

export function MessageBubble({ role, content, onEdit, onRegenerate }: Props) {
  const isUser = role === 'user';
  const isSystem = role === 'system';

  return (
    <Paper
      withBorder={!isSystem}
      p={isSystem ? 'xs' : 'md'}
      radius="md"
      bg={isUser ? 'var(--mantine-color-violet-light)' : isSystem ? 'var(--mantine-color-gray-light)' : undefined}
      mb="sm"
      style={{ maxWidth: '85%', marginLeft: isUser ? 'auto' : 0 }}
    >
      {isSystem && (
        <Text size="xs" fw={700} c="dimmed" mb={4}>SYSTEM PROMPT</Text>
      )}
      {role === 'assistant' ? (
        <div style={{ fontSize: 'var(--mantine-font-size-sm)' }}>
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      ) : (
        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{content}</Text>
      )}
      <Group gap={4} mt={4} justify="flex-end">
        <CopyButton value={content} timeout={2000}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? 'Copied' : 'Copy'}>
              <ActionIcon variant="subtle" size="xs" color="gray" onClick={copy}>
                {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
        {isUser && onEdit && (
          <Tooltip label="Edit">
            <ActionIcon variant="subtle" size="xs" color="gray" onClick={onEdit}>
              <IconEdit size={12} />
            </ActionIcon>
          </Tooltip>
        )}
        {role === 'assistant' && onRegenerate && (
          <Tooltip label="Regenerate">
            <ActionIcon variant="subtle" size="xs" color="gray" onClick={onRegenerate}>
              <IconRefresh size={12} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </Paper>
  );
}
```

- [ ] **Step 7: Write ChatArea**

Write `packages/console-ui/src/components/playground/ChatArea.tsx`:

```typescript
import { useRef, useEffect } from 'react';
import { ScrollArea, Text, Alert } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from '@/types';

interface Props {
  systemPrompt: string;
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  error: string | null;
  errorType: string | null;
  retryAfter: number | null;
  onEditMessage: (index: number) => void;
  onRegenerate: () => void;
  onRetry: () => void;
}

export function ChatArea({
  systemPrompt, messages, isStreaming, streamingContent,
  error, errorType, retryAfter, onEditMessage, onRegenerate, onRetry,
}: Props) {
  const viewport = useRef<HTMLDivElement>(null);

  useEffect(() => {
    viewport.current?.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streamingContent]);

  return (
    <ScrollArea viewportRef={viewport} h="100%" offsetScrollbars>
      <div style={{ padding: 'var(--mantine-spacing-md)' }}>
        {systemPrompt && (
          <MessageBubble role="system" content={systemPrompt} />
        )}
        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            role={msg.role}
            content={msg.content}
            onEdit={msg.role === 'user' ? () => onEditMessage(i) : undefined}
            onRegenerate={msg.role === 'assistant' ? () => onRegenerate() : undefined}
          />
        ))}
        {isStreaming && streamingContent && (
          <MessageBubble role="assistant" content={streamingContent} />
        )}
        {isStreaming && !streamingContent && (
          <Text size="sm" c="dimmed" fs="italic">Generating...</Text>
        )}
        {error && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            color="red"
            variant="light"
            title={errorType === 'rate_limit' ? 'Rate Limited' : errorType === 'timeout' ? 'Connection Lost' : 'Error'}
          >
            <Text size="sm">
              {error}
              {retryAfter && ` — Retry in ${retryAfter}s`}
            </Text>
            {onRetry && (
              <Text size="sm" c="violet" style={{ cursor: 'pointer', marginTop: 4 }} onClick={onRetry}>
                Retry
              </Text>
            )}
          </Alert>
        )}
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 8: Write ChatInput**

Write `packages/console-ui/src/components/playground/ChatInput.tsx`:

```typescript
import { useState, useRef, useEffect } from 'react';
import { Textarea, ActionIcon, Group, Text } from '@mantine/core';
import { IconArrowUp, IconPaperclip } from '@tabler/icons-react';

interface Props {
  onSend: (content: string) => void;
  disabled: boolean;
  multiModal: boolean;
  maxTokens: number;
}

export function ChatInput({ onSend, disabled, multiModal, maxTokens }: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [disabled]);

  const estimatedTokens = Math.ceil(value.length / 4);
  const isOverLimit = estimatedTokens > maxTokens;

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ padding: 'var(--mantine-spacing-md)', borderTop: '1px solid var(--mantine-color-default-border)' }}>
      <Group align="flex-end" gap="xs">
        {multiModal && (
          <ActionIcon variant="light" size="lg" disabled={disabled}>
            <IconPaperclip size={18} />
          </ActionIcon>
        )}
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
          minRows={1}
          maxRows={6}
          autosize
          disabled={disabled}
          style={{ flex: 1 }}
        />
        <ActionIcon
          variant="filled"
          size="lg"
          color="violet"
          onClick={handleSend}
          disabled={disabled || !value.trim()}
        >
          <IconArrowUp size={18} />
        </ActionIcon>
      </Group>
      {value && (
        <Text size="xs" c={isOverLimit ? 'red' : 'dimmed'} mt={4}>
          ~{estimatedTokens} tokens{isOverLimit && ` — exceeds model limit by ${estimatedTokens - maxTokens} tokens`}
        </Text>
      )}
    </div>
  );
}
```

- [ ] **Step 9: Write PlaygroundPage**

Write `packages/console-ui/src/pages/playground/PlaygroundPage.tsx`:

```typescript
import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Group, Title } from '@mantine/core';
import { ModelSelector } from '@/components/playground/ModelSelector';
import { ChatArea } from '@/components/playground/ChatArea';
import { ChatInput } from '@/components/playground/ChatInput';
import { SettingsPanel } from '@/components/playground/SettingsPanel';
import { SessionTabs } from '@/components/playground/SessionTabs';
import { usePlaygroundSession } from '@/hooks/usePlaygroundSession';
import { usePlaygroundChat } from '@/hooks/usePlaygroundChat';
import { useModels } from '@/hooks/useModels';

export function PlaygroundPage() {
  const [searchParams] = useSearchParams();
  const urlModelId = searchParams.get('model');

  const {
    sessions, activeId, activeSession,
    setActiveId, createSession, addMessage,
    updateLastAssistant, renameSession, removeSession,
    changeModel,
  } = usePlaygroundSession(urlModelId ?? 'llama-3.1-8b-instruct');

  const { send, cancel, isStreaming, error, errorType, retryAfter } = usePlaygroundChat();
  const { data: models } = useModels();
  const [streamingContent, setStreamingContent] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');

  // Ensure there's always an active session
  if (!activeSession && sessions.length === 0) {
    createSession(urlModelId);
  }

  const currentModel = models?.find((m) => m.id === activeSession?.modelId);
  const contextWindow = currentModel?.capabilities.context_window ?? 131072;

  const [params, setParams] = useState({
    max_tokens: 512,
    temperature: 0.7,
    top_p: 1.0,
    stop: [] as string[],
    frequency_penalty: 0,
    presence_penalty: 0,
    response_format: 'text' as 'text' | 'json_object',
  });

  const handleSend = useCallback((content: string) => {
    if (!activeId) return;
    const userMsg = { role: 'user' as const, content };
    addMessage(activeId, userMsg);
    setStreamingContent('');

    const allMessages = [
      ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
      ...(activeSession?.messages ?? []),
      userMsg,
    ];

    send(
      activeSession?.modelId ?? 'llama-3.1-8b-instruct',
      allMessages,
      params,
      (token) => setStreamingContent((prev) => prev + token),
      () => {
        setStreamingContent((prev) => {
          if (prev && activeId) {
            updateLastAssistant(activeId, prev);
          }
          return '';
        });
      },
      (_err) => { /* error handled by hook */ },
    );
  }, [activeId, activeSession, systemPrompt, params, addMessage, send, updateLastAssistant]);

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px - var(--mantine-spacing-md) * 2)' }}>
      {/* Left: Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Group px="md" pt="md" pb="xs" justify="space-between">
          <Group>
            <Title order={4}>Playground</Title>
            <ModelSelector
              value={activeSession?.modelId ?? ''}
              onChange={(id) => activeId && changeModel(activeId, id)}
            />
          </Group>
        </Group>
        <SessionTabs
          sessions={sessions}
          activeId={activeId}
          onSelect={setActiveId}
          onCreate={() => createSession()}
          onRename={renameSession}
          onDelete={removeSession}
        />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ChatArea
            systemPrompt={systemPrompt}
            messages={activeSession?.messages ?? []}
            isStreaming={isStreaming}
            streamingContent={streamingContent}
            error={error}
            errorType={errorType}
            retryAfter={retryAfter}
            onEditMessage={(i) => {/* TODO */}}
            onRegenerate={() => {/* TODO */}}
            onRetry={() => {/* TODO */}}
          />
        </div>
        <ChatInput
          onSend={handleSend}
          disabled={isStreaming || !activeSession}
          multiModal={currentModel?.capabilities.multi_modal ?? false}
          maxTokens={contextWindow}
        />
      </div>

      {/* Right: Settings Panel */}
      <SettingsPanel
        params={params}
        onChange={setParams}
        systemPrompt={systemPrompt}
        onSystemPromptChange={setSystemPrompt}
      />
    </div>
  );
}
```

- [ ] **Step 10: Write SettingsPanel (stub for now)**

Write `packages/console-ui/src/components/playground/SettingsPanel.tsx`:

```typescript
import { Stack, Paper, Title, Slider, TextInput, Select, Textarea, NumberInput, SegmentedControl, Text } from '@mantine/core';

interface Params {
  max_tokens: number;
  temperature: number;
  top_p: number;
  stop: string[];
  frequency_penalty: number;
  presence_penalty: number;
  response_format: 'text' | 'json_object';
}

interface Props {
  params: Params;
  onChange: (p: Params) => void;
  systemPrompt: string;
  onSystemPromptChange: (s: string) => void;
}

export function SettingsPanel({ params, onChange, systemPrompt, onSystemPromptChange }: Props) {
  const update = (patch: Partial<Params>) => onChange({ ...params, ...patch });

  return (
    <Paper withBorder style={{ width: 280, flexShrink: 0, overflow: 'auto' }} p="md" ml="md">
      <Title order={5} mb="md">Settings</Title>
      <Stack gap="md">
        <Textarea
          label="System Prompt"
          placeholder="You are a helpful assistant."
          minRows={3}
          maxRows={5}
          value={systemPrompt}
          onChange={(e) => onSystemPromptChange(e.currentTarget.value)}
        />
        <div>
          <Text size="sm" fw={500} mb={4}>Max Tokens</Text>
          <Slider
            min={16} max={4096} step={16}
            value={params.max_tokens}
            onChange={(v) => update({ max_tokens: v })}
            marks={[{ value: 512, label: '512' }, { value: 2048, label: '2K' }, { value: 4096, label: '4K' }]}
          />
        </div>
        <div>
          <Text size="sm" fw={500} mb={4}>Temperature ({params.temperature})</Text>
          <Slider
            min={0} max={2} step={0.01}
            value={params.temperature}
            onChange={(v) => update({ temperature: v })}
          />
        </div>
        <div>
          <Text size="sm" fw={500} mb={4}>Top P ({params.top_p})</Text>
          <Slider
            min={0} max={1} step={0.01}
            value={params.top_p}
            onChange={(v) => update({ top_p: v })}
          />
        </div>
        <TextInput
          label="Stop Sequences"
          placeholder="Comma-separated"
          value={params.stop.join(', ')}
          onChange={(e) => update({ stop: e.currentTarget.value.split(',').map((s) => s.trim()).filter(Boolean) })}
        />
        <div>
          <Text size="sm" fw={500} mb={4}>Frequency Penalty ({params.frequency_penalty})</Text>
          <Slider
            min={-2} max={2} step={0.01}
            value={params.frequency_penalty}
            onChange={(v) => update({ frequency_penalty: v })}
          />
        </div>
        <div>
          <Text size="sm" fw={500} mb={4}>Presence Penalty ({params.presence_penalty})</Text>
          <Slider
            min={-2} max={2} step={0.01}
            value={params.presence_penalty}
            onChange={(v) => update({ presence_penalty: v })}
          />
        </div>
        <Select
          label="Response Format"
          data={[
            { value: 'text', label: 'Text' },
            { value: 'json_object', label: 'JSON Object' },
          ]}
          value={params.response_format}
          onChange={(v) => update({ response_format: (v as 'text' | 'json_object') ?? 'text' })}
        />
      </Stack>
    </Paper>
  );
}
```

- [ ] **Step 11: Write SessionTabs**

Write `packages/console-ui/src/components/playground/SessionTabs.tsx`:

```typescript
import { Tabs, ActionIcon, TextInput, Group } from '@mantine/core';
import { IconPlus, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import type { PlaygroundSession } from '@/types';

interface Props {
  sessions: PlaygroundSession[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export function SessionTabs({ sessions, activeId, onSelect, onCreate, onRename, onDelete }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  return (
    <Tabs value={activeId} onChange={(v) => v && onSelect(v)} variant="outline">
      <Group gap={0} wrap="nowrap">
        <Tabs.List style={{ flex: 1, overflow: 'auto' }}>
          {sessions.map((s) => (
            <Tabs.Tab
              key={s.id}
              value={s.id}
              onDoubleClick={() => { setEditingId(s.id); setEditValue(s.name); }}
              rightSection={
                sessions.length > 1 ? (
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    color="gray"
                    onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                  >
                    <IconX size={12} />
                  </ActionIcon>
                ) : undefined
              }
            >
              {editingId === s.id ? (
                <TextInput
                  size="xs"
                  value={editValue}
                  onChange={(e) => setEditValue(e.currentTarget.value)}
                  onBlur={() => { onRename(s.id, editValue || s.name); setEditingId(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { onRename(s.id, editValue || s.name); setEditingId(null); } }}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  style={{ minWidth: 80 }}
                />
              ) : (
                s.name
              )}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <ActionIcon variant="subtle" onClick={onCreate} ml={4}>
          <IconPlus size={16} />
        </ActionIcon>
      </Group>
    </Tabs>
  );
}
```

- [ ] **Step 12: Add Playground route to App and add react-markdown dep**

```bash
cd packages/console-ui && pnpm add react-markdown
```

Edit `packages/console-ui/src/App.tsx` — add import and routes:

```typescript
import { PlaygroundPage } from '@/pages/playground/PlaygroundPage';
```

Add routes:

```typescript
<Route path="/playground" element={<PlaygroundPage />} />
<Route path="/playground/:sessionId" element={<PlaygroundPage />} />
```

- [ ] **Step 13: Verify typecheck**

```bash
cd packages/console-ui && pnpm typecheck
```

Expected: No errors.

- [ ] **Step 14: Commit**

```bash
git add packages/console-ui/src packages/console-ui/package.json pnpm-lock.yaml
git commit -m "feat: add Playground with chat streaming, session management, and settings panel"
```

---

## Task 8: API Keys Page

**Files:**
- Create: `packages/console-ui/src/api/apiKeys.ts`
- Create: `packages/console-ui/src/hooks/useApiKeys.ts`
- Create: `packages/console-ui/src/components/api-keys/KeyList.tsx`
- Create: `packages/console-ui/src/components/api-keys/CreateKeyModal.tsx`
- Create: `packages/console-ui/src/pages/api-keys/ApiKeysPage.tsx`

- [ ] **Step 1: Write API keys API + hook**

Write `packages/console-ui/src/api/apiKeys.ts`:

```typescript
import { apiFetch } from './client';
import type { PaginatedResponse, ApiKey, ApiKeyCreated, CreateApiKeyRequest } from '@/types';

export async function getApiKeys() {
  return apiFetch<PaginatedResponse<ApiKey>>('/v1/admin/api-keys');
}

export async function createApiKey(data: CreateApiKeyRequest) {
  return apiFetch<{ data: ApiKeyCreated }>('/v1/admin/api-keys', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function revokeApiKey(id: string) {
  return apiFetch<void>(`/v1/admin/api-keys/${id}`, { method: 'DELETE' });
}
```

Write `packages/console-ui/src/hooks/useApiKeys.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiKeys, createApiKey, revokeApiKey } from '@/api/apiKeys';
import type { CreateApiKeyRequest } from '@/types';

export function useApiKeys() {
  return useQuery({
    queryKey: ['api-keys'],
    queryFn: () => getApiKeys().then((r) => r.data),
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateApiKeyRequest) => createApiKey(data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });
}
```

- [ ] **Step 2: Write KeyList**

Write `packages/console-ui/src/components/api-keys/KeyList.tsx`:

```typescript
import { Table, Badge, Group, ActionIcon, Text, CopyButton, Tooltip, Skeleton, Modal, Button } from '@mantine/core';
import { IconTrash, IconCopy, IconCheck } from '@tabler/icons-react';
import { useApiKeys, useRevokeApiKey } from '@/hooks/useApiKeys';
import { formatCurrency, formatRelativeTime } from '@/utils/format';
import type { ApiKey } from '@/types';
import { useState } from 'react';

export function KeyList() {
  const { data: keys, isLoading } = useApiKeys();
  const revokeMutation = useRevokeApiKey();
  const [revokeId, setRevokeId] = useState<string | null>(null);

  const handleRevoke = async () => {
    if (!revokeId) return;
    await revokeMutation.mutateAsync(revokeId);
    setRevokeId(null);
  };

  const rows = (keys ?? []).map((key: ApiKey) => (
    <Table.Tr key={key.id} style={{ opacity: key.status === 'revoked' ? 0.5 : 1 }}>
      <Table.Td>
        <Text size="sm" fw={500}>{key.name}</Text>
        <Group gap={4}>
          <Text size="xs" c="dimmed" ff="mono">{key.prefix}</Text>
          <CopyButton value={key.prefix} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Copied' : 'Copy prefix'}>
                <ActionIcon variant="subtle" size="xs" onClick={copy}>
                  {copied ? <IconCheck size={10} /> : <IconCopy size={10} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Group>
      </Table.Td>
      <Table.Td>
        <Badge
          size="sm"
          variant="light"
          color={key.role === 'admin' ? 'red' : key.role === 'developer' ? 'blue' : 'gray'}
        >
          {key.role}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Text size="sm">{formatCurrency(key.usage_this_month_usd)}</Text>
        {key.monthly_quota_usd && (
          <Text size="xs" c="dimmed">/ {formatCurrency(key.monthly_quota_usd)} limit</Text>
        )}
      </Table.Td>
      <Table.Td><Text size="sm">{formatRelativeTime(key.created_at)}</Text></Table.Td>
      <Table.Td>
        <Badge color={key.status === 'active' ? 'green' : 'gray'} variant="dot" size="sm">
          {key.status}
        </Badge>
      </Table.Td>
      <Table.Td>
        {key.status === 'active' && (
          <ActionIcon
            variant="light" color="red" size="sm"
            onClick={() => setRevokeId(key.id)}
            loading={revokeMutation.isPending && revokeId === key.id}
          >
            <IconTrash size={14} />
          </ActionIcon>
        )}
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Role</Table.Th>
            <Table.Th>Usage</Table.Th>
            <Table.Th>Created</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <Table.Tr key={i}>{Array.from({ length: 6 }).map((_, j) => <Table.Td key={j}><Skeleton height={20} /></Table.Td>)}</Table.Tr>
              ))
            : rows}
        </Table.Tbody>
      </Table>

      <Modal opened={!!revokeId} onClose={() => setRevokeId(null)} title="Revoke API Key" centered>
        <Text size="sm" mb="md">
          Are you sure you want to revoke this API key? This action cannot be undone. All requests using this key will fail immediately.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setRevokeId(null)}>Cancel</Button>
          <Button color="red" onClick={handleRevoke} loading={revokeMutation.isPending}>
            Revoke Key
          </Button>
        </Group>
      </Modal>
    </>
  );
}
```

- [ ] **Step 3: Write CreateKeyModal**

Write `packages/console-ui/src/components/api-keys/CreateKeyModal.tsx`:

```typescript
import { useState } from 'react';
import { Modal, TextInput, Select, MultiSelect, NumberInput, Button, Group, Text, Alert, Code, CopyButton, ActionIcon } from '@mantine/core';
import { IconCheck, IconCopy, IconAlertCircle } from '@tabler/icons-react';
import { useCreateApiKey } from '@/hooks/useApiKeys';
import { useModels } from '@/hooks/useModels';

interface Props {
  opened: boolean;
  onClose: () => void;
}

export function CreateKeyModal({ opened, onClose }: Props) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<'admin' | 'developer' | 'readonly'>('developer');
  const [modelAllowlist, setModelAllowlist] = useState<string[]>([]);
  const [monthlyQuota, setMonthlyQuota] = useState<number | undefined>();
  const createMutation = useCreateApiKey();
  const { data: models } = useModels();
  const [secret, setSecret] = useState<string | null>(null);

  const modelOptions = (models ?? []).map((m) => ({ value: m.id, label: m.display_name }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await createMutation.mutateAsync({
      name,
      role,
      model_allowlist: modelAllowlist.length > 0 ? modelAllowlist : undefined,
      monthly_quota_usd: monthlyQuota,
    });
    setSecret(result.secret);
  };

  const handleClose = () => {
    setName('');
    setRole('developer');
    setModelAllowlist([]);
    setMonthlyQuota(undefined);
    setSecret(null);
    onClose();
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Create API Key" centered size="lg">
      {secret ? (
        <>
          <Alert icon={<IconAlertCircle size={16} />} color="yellow" variant="light" mb="md">
            <Text size="sm" fw={500}>Save this key now — you won't be able to see it again.</Text>
          </Alert>
          <Group mb="md">
            <Code block style={{ flex: 1 }}>{secret}</Code>
            <CopyButton value={secret} timeout={2000}>
              {({ copied, copy }) => (
                <ActionIcon color={copied ? 'teal' : 'gray'} variant="light" onClick={copy} size="lg">
                  {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
                </ActionIcon>
              )}
            </CopyButton>
          </Group>
          <Button fullWidth onClick={handleClose}>Done</Button>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <TextInput
            label="Key Name"
            placeholder="Production"
            required
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            mb="sm"
          />
          <Select
            label="Role"
            data={[
              { value: 'admin', label: 'Admin — full access' },
              { value: 'developer', label: 'Developer — inference only' },
              { value: 'readonly', label: 'Read-only — view only' },
            ]}
            value={role}
            onChange={(v) => setRole(v as typeof role)}
            mb="sm"
          />
          <MultiSelect
            label="Model Allowlist (optional)"
            placeholder="All models available if empty"
            data={modelOptions}
            value={modelAllowlist}
            onChange={setModelAllowlist}
            searchable
            clearable
            mb="sm"
          />
          <NumberInput
            label="Monthly Quota (USD, optional)"
            placeholder="No limit"
            value={monthlyQuota ?? ''}
            onChange={(v) => setMonthlyQuota(typeof v === 'number' ? v : undefined)}
            min={0}
            mb="lg"
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={handleClose}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending} disabled={!name}>
              Create Key
            </Button>
          </Group>
        </form>
      )}
    </Modal>
  );
}
```

- [ ] **Step 4: Write ApiKeysPage**

Write `packages/console-ui/src/pages/api-keys/ApiKeysPage.tsx`:

```typescript
import { useState } from 'react';
import { Title, Button, Group, Paper, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { KeyList } from '@/components/api-keys/KeyList';
import { CreateKeyModal } from '@/components/api-keys/CreateKeyModal';

export function ApiKeysPage() {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>API Keys</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateOpen(true)}>
          Create API Key
        </Button>
      </Group>

      <Paper withBorder p="lg" radius="md">
        <KeyList />
      </Paper>

      <CreateKeyModal opened={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}
```

- [ ] **Step 5: Add API Keys route to App**

Edit `packages/console-ui/src/App.tsx` — add import and route:

```typescript
import { ApiKeysPage } from '@/pages/api-keys/ApiKeysPage';
```

Add route:

```typescript
<Route path="/api-keys" element={<ApiKeysPage />} />
```

- [ ] **Step 6: Verify typecheck**

```bash
cd packages/console-ui && pnpm typecheck
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add packages/console-ui/src
git commit -m "feat: add API Keys page with list, create modal, and revoke with confirmation"
```

---

## Task 9: Billing Page

**Files:**
- Create: `packages/console-ui/src/components/billing/BalanceCard.tsx`
- Create: `packages/console-ui/src/components/billing/UsageChart.tsx`
- Create: `packages/console-ui/src/components/billing/InvoicesTable.tsx`
- Create: `packages/console-ui/src/pages/billing/BillingPage.tsx`

- [ ] **Step 1: Write BalanceCard**

Write `packages/console-ui/src/components/billing/BalanceCard.tsx`:

```typescript
import { Paper, Text, Group, Button, Stack, RingProgress } from '@mantine/core';
import { useBilling } from '@/hooks/useBilling';
import { formatCurrency } from '@/utils/format';

export function BalanceCard() {
  const { data: billing } = useBilling();

  if (!billing) return null;

  const budgetPct = billing.monthly_budget_usd
    ? Math.min((billing.month_to_date_spend_usd / billing.monthly_budget_usd) * 100, 100)
    : 0;

  return (
    <Paper withBorder p="lg" radius="md" mb="md">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Stack gap="xs">
          <Text size="sm" fw={500} c="dimmed">Current Balance</Text>
          <Text size="xl" fw={700}>{formatCurrency(billing.balance_usd)}</Text>
          <Group gap="xs">
            <Button size="xs" variant="light">Add Funds</Button>
            {billing.auto_recharge_enabled ? (
              <Text size="xs" c="dimmed">Auto-recharge enabled</Text>
            ) : (
              <Button size="xs" variant="subtle">Enable Auto-recharge</Button>
            )}
          </Group>
        </Stack>
        {billing.monthly_budget_usd && (
          <Stack align="center" gap={4}>
            <Text size="xs" c="dimmed">Monthly Budget</Text>
            <RingProgress
              size={100}
              thickness={8}
              sections={[{ value: budgetPct, color: budgetPct > 90 ? 'red' : budgetPct > 75 ? 'yellow' : 'violet' }]}
              label={<Text size="xs" ta="center" fw={700}>{budgetPct.toFixed(0)}%</Text>}
            />
            <Text size="xs" c="dimmed">
              {formatCurrency(billing.month_to_date_spend_usd)} / {formatCurrency(billing.monthly_budget_usd)}
            </Text>
            <Text size="xs" c="dimmed">
              Est. month end: {formatCurrency(billing.estimated_month_end_usd)}
            </Text>
          </Stack>
        )}
      </Group>
    </Paper>
  );
}
```

- [ ] **Step 2: Write UsageChart**

Write `packages/console-ui/src/components/billing/UsageChart.tsx`:

```typescript
import { Paper, Text, SegmentedControl, Group, SimpleGrid } from '@mantine/core';
import { useState } from 'react';
import { DonutChart, BarChart } from '@mantine/charts';
import { useUsage } from '@/hooks/useUsage';
import { formatCurrency } from '@/utils/format';

export function UsageChart() {
  const [range, setRange] = useState('today');
  const { data: usage } = useUsage(range);

  const donutData = (usage?.by_model ?? []).map((m) => ({
    name: m.model_display_name,
    value: m.cost_usd,
    color: ['violet', 'blue', 'green', 'orange', 'pink'][
      (usage?.by_model ?? []).indexOf(m)
    ],
  }));

  const barData = (usage?.by_model ?? []).map((m) => ({
    model: m.model_display_name,
    'Input Tokens': m.input_tokens,
    'Output Tokens': m.output_tokens,
  }));

  return (
    <Paper withBorder p="lg" radius="md" mb="md">
      <Group justify="space-between" mb="md">
        <Text size="sm" fw={500}>Usage</Text>
        <SegmentedControl
          size="xs"
          data={[
            { label: 'Today', value: 'today' },
            { label: '7 Days', value: '7d' },
            { label: '30 Days', value: '30d' },
          ]}
          value={range}
          onChange={setRange}
        />
      </Group>
      {usage && (
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <div>
            <Text size="xs" c="dimmed" ta="center" mb="sm">Cost by Model</Text>
            <DonutChart data={donutData} size={180} thickness={20} withLabels withLabelsLine />
          </div>
          <div>
            <Text size="xs" c="dimmed" ta="center" mb="sm">Tokens by Model</Text>
            <BarChart
              h={180}
              data={barData}
              dataKey="model"
              series={[
                { name: 'Input Tokens', color: 'violet.6' },
                { name: 'Output Tokens', color: 'blue.6' },
              ]}
              tickLine="none"
              gridAxis="y"
            />
          </div>
        </SimpleGrid>
      )}
    </Paper>
  );
}
```

- [ ] **Step 3: Write InvoicesTable**

Write `packages/console-ui/src/components/billing/InvoicesTable.tsx`:

```typescript
import { Paper, Text, Table, Badge } from '@mantine/core';
import { useBilling } from '@/hooks/useBilling';
import { formatCurrency } from '@/utils/format';

export function InvoicesTable() {
  const { data: billing } = useBilling();

  if (!billing?.invoices?.length) return null;

  return (
    <Paper withBorder p="lg" radius="md">
      <Text size="sm" fw={500} mb="sm">Invoices</Text>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Period</Table.Th>
            <Table.Th>Amount</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Issued</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {billing.invoices.map((inv) => (
            <Table.Tr key={inv.id}>
              <Table.Td>{inv.period}</Table.Td>
              <Table.Td>{formatCurrency(inv.amount_usd)}</Table.Td>
              <Table.Td>
                <Badge
                  size="sm"
                  variant="light"
                  color={inv.status === 'paid' ? 'green' : inv.status === 'overdue' ? 'red' : 'yellow'}
                >
                  {inv.status}
                </Badge>
              </Table.Td>
              <Table.Td>{new Date(inv.issued_at).toLocaleDateString()}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}
```

- [ ] **Step 4: Write BillingPage**

Write `packages/console-ui/src/pages/billing/BillingPage.tsx`:

```typescript
import { Title } from '@mantine/core';
import { BalanceCard } from '@/components/billing/BalanceCard';
import { UsageChart } from '@/components/billing/UsageChart';
import { InvoicesTable } from '@/components/billing/InvoicesTable';

export function BillingPage() {
  return (
    <>
      <Title order={2} mb="md">Billing</Title>
      <BalanceCard />
      <UsageChart />
      <InvoicesTable />
    </>
  );
}
```

- [ ] **Step 4b: Write KeyUsageTable (per-key usage breakdown from spec §6.7)**

Write `packages/console-ui/src/components/billing/KeyUsageTable.tsx`:

```typescript
import { Table, Text, Paper } from '@mantine/core';
import { useUsage } from '@/hooks/useUsage';
import { formatCurrency, formatTokens } from '@/utils/format';

export function KeyUsageTable() {
  const { data: usage } = useUsage();

  if (!usage?.by_key?.length) return null;

  return (
    <Paper withBorder p="lg" radius="md" mb="md">
      <Text size="sm" fw={500} mb="sm">Usage by API Key</Text>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Key</Table.Th>
            <Table.Th>Requests</Table.Th>
            <Table.Th>Input Tokens</Table.Th>
            <Table.Th>Output Tokens</Table.Th>
            <Table.Th>Cost</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {usage.by_key.map((k) => (
            <Table.Tr key={k.key_id}>
              <Table.Td>
                <Text size="sm" fw={500}>{k.key_name}</Text>
                <Text size="xs" c="dimmed" ff="mono">{k.key_prefix}</Text>
              </Table.Td>
              <Table.Td>{k.requests.toLocaleString()}</Table.Td>
              <Table.Td>{formatTokens(k.input_tokens)}</Table.Td>
              <Table.Td>{formatTokens(k.output_tokens)}</Table.Td>
              <Table.Td>{formatCurrency(k.cost_usd)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}
```

Update `BillingPage.tsx` to include `KeyUsageTable` (add import and insert `<KeyUsageTable />` after `<UsageChart />`).

- [ ] **Step 5: Add Billing route to App**

Edit `packages/console-ui/src/App.tsx` — add import and route:

```typescript
import { BillingPage } from '@/pages/billing/BillingPage';
```

Add route:

```typescript
<Route path="/billing" element={<BillingPage />} />
```

- [ ] **Step 6: Verify typecheck**

```bash
cd packages/console-ui && pnpm typecheck
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add packages/console-ui/src
git commit -m "feat: add Billing page with balance, usage charts, and invoices"
```

---

## Task 10: Settings/Profile Page

**Files:**
- Create: `packages/console-ui/src/pages/settings/ProfilePage.tsx`

- [ ] **Step 1: Write ProfilePage**

Write `packages/console-ui/src/pages/settings/ProfilePage.tsx`:

```typescript
import { Title, Paper, TextInput, Button, Group, Text, SegmentedControl, useMantineColorScheme } from '@mantine/core';
import { useAuth } from '@/stores/AuthContext';
import { useState } from 'react';

export function ProfilePage() {
  const { user } = useAuth();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [name, setName] = useState(user?.name ?? '');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // TODO: Wire to backend PATCH endpoint
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <>
      <Title order={2} mb="md">Profile</Title>

      <Paper withBorder p="lg" radius="md" mb="md">
        <Title order={4} mb="sm">Personal Information</Title>
        <TextInput label="Email" value={user?.email ?? ''} disabled mb="sm" />
        <TextInput
          label="Name"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          mb="md"
        />
        <Group>
          <Button onClick={handleSave}>{saved ? 'Saved!' : 'Save Changes'}</Button>
        </Group>
      </Paper>

      <Paper withBorder p="lg" radius="md">
        <Title order={4} mb="sm">Appearance</Title>
        <SegmentedControl
          value={colorScheme}
          onChange={(v) => setColorScheme(v as 'light' | 'dark' | 'auto')}
          data={[
            { label: 'Light', value: 'light' },
            { label: 'Dark', value: 'dark' },
            { label: 'System', value: 'auto' },
          ]}
        />
      </Paper>
    </>
  );
}
```

- [ ] **Step 2: Add Settings route to App**

Edit `packages/console-ui/src/App.tsx` — add import and route:

```typescript
import { ProfilePage } from '@/pages/settings/ProfilePage';
```

Add route:

```typescript
<Route path="/settings/profile" element={<ProfilePage />} />
```

- [ ] **Step 3: Verify typecheck and full app test**

```bash
cd packages/console-ui && pnpm typecheck
```

Expected: No errors.

```bash
# Start API stub (terminal 1)
cd packages/console-api && pnpm dev

# Start UI (terminal 2)
cd packages/console-ui && pnpm dev
```

Open `http://localhost:5173` — should:
- Redirect to `/login`
- Log in with any credentials (stub accepts all)
- Navigate Dashboard → Models → Playground → API Keys → Billing → Settings
- Playground: type a message, see streaming response, switch models
- API Keys: create a key, see secret, revoke with confirmation
- Toggle dark/light mode

- [ ] **Step 4: Commit**

```bash
git add packages/console-ui/src
git commit -m "feat: add Settings/Profile page with theme toggle"
```

---

## Task 11: Polish & Integration

**Files:**
- Modify: `packages/console-ui/src/App.tsx`

- [ ] **Step 1: Verify full typecheck and build**

```bash
cd packages/console-ui && pnpm typecheck && pnpm build
```

Expected: No errors. Build produces `dist/` output.

- [ ] **Step 3: Run final integration smoke test**

Start both servers, navigate to each page, verify:
- Auth flow (login → dashboard)
- Dashboard loads all sections
- Models page shows featured cards and table with filters
- Model detail shows capabilities, pricing, code examples
- Playground: create multiple sessions, send messages, see streaming, switch models
- API Keys: create key, see secret, revoke key (stub works)
- Billing: balance, charts, invoices render
- Settings: name field, theme toggle

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: complete Phase 1a MVP — all pages functional with stub backend"
```

---

## Summary

Total tasks: 11
Estimated effort: Phase 1a MVP (4-6 weeks per spec)

### Pages delivered:
| Page | Route | Status |
|------|-------|--------|
| Login | `/login` | ✅ |
| Accept Invitation | `/accept-invitation` | ✅ |
| Dashboard | `/dashboard` | ✅ |
| Models | `/models` | ✅ |
| Model Detail | `/models/:modelId` | ✅ |
| Playground | `/playground` | ✅ |
| API Keys | `/api-keys` | ✅ |
| Billing | `/billing` | ✅ |
| Settings/Profile | `/settings/profile` | ✅ |

### Key differentiators implemented (per competitive analysis):
- Playground multi-session management (Tabs) — ahead of Together AI
- Playground session persistence (localStorage) — ahead of Together AI
- Playground error states (rate limit, timeout, model unavailable) — ahead of Together AI
- API Key roles + model allowlist — ahead of Together AI
- Curated model directory (4 featured + table) — differentiated from Together's 200+
- Model detail page with code examples — Together has no equivalent
- Billing with per-key usage split — ahead of Together AI

### Not yet implemented (deferred to Phase 1b):
- `ApiViewModal` component (code generation from Playground — curl/Python/TS)
- Playground message editing / regeneration from UI
- Playground image upload (multi-modal models)
- Endpoints, Batch Jobs
- Backend session persistence (currently localStorage only)
- Models table: placeholder columns for "Avg Latency" / "GPU Utilization" (Phase 2 data)
- Models table: "Deploy custom model" action (Phase 1 stub with tip)
- API Key: update role/quota UI (stub PATCH endpoint exists, no UI form yet)
- Invitation management UI (admin sends invites — stub endpoints exist)
- `@mantine/charts` proper data integration (stub charts render but may need refinement)

### Reviewer fixes applied (2026-07-10):
- ✅ **B1**: Vite `@/` path alias moved to Task 1 Step 2 (was incorrectly deferred to Task 11)
- ✅ **I1**: `KeyUsageTable.tsx` added to billing components + rendered in BillingPage
- ✅ **I2**: `PATCH /v1/admin/api-keys/:id` stub endpoint added
- ✅ **I3**: `POST/GET /v1/admin/invitations` stub endpoints added
- ✅ **I4**: `AuthContext` refactored to use `api/auth.ts` instead of raw `fetch`
- ✅ **I5**: `POST /v1/admin/auth/logout` stub endpoint added
- ✅ **N1**: `ApiViewModal.tsx` removed from Phase 1a file structure (explicitly deferred)
