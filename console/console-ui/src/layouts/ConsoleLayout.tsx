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
