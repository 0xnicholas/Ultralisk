// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock the auth store so login() is a no-op
vi.mock('@/stores/useAuth', () => ({
  useAuth: () => ({
    user: null,
    jwt: null,
    isLoading: false,
    login: vi.fn(),
    acceptInvitation: vi.fn(),
    logout: vi.fn(),
  }),
}));

// Mock useNavigate so the form submit doesn't crash
vi.mock('react-router-dom', async () => {
  const real = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...real, useNavigate: () => vi.fn() };
});

import { MantineProvider } from '@mantine/core';
import { LoginPage } from './LoginPage';

function renderWithProviders(ui: React.ReactNode) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe('LoginPage - Dev Login visibility', () => {
  it('renders the Dev Login button in dev builds', () => {
    // import.meta.env.DEV is true in the vitest runner (vite dev mode),
    // so the conditional renders the bypass button.
    renderWithProviders(<LoginPage />);
    expect(screen.getByRole('button', { name: /Dev Login/ })).toBeTruthy();
  });
});

// Production build test: we'd render in a non-DEV env. Vitest doesn't
// easily switch import.meta.env.DEV at runtime, but the build step
// already dead-code-eliminates the conditional via esbuild's define,
// so the bundle won't contain the button at all in production. The
// real check is: open `dist/assets/index-*.js` after a prod build and
// grep for 'Dev Login' — must return 0 matches. That check lives in
// scripts/postbuild-smoke.sh (see below).
