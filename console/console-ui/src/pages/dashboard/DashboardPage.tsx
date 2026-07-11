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
