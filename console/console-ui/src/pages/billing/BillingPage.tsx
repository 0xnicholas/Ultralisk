import { Title } from '@mantine/core';
import { BalanceCard } from '@/components/billing/BalanceCard';
import { UsageChart } from '@/components/billing/UsageChart';
import { KeyUsageTable } from '@/components/billing/KeyUsageTable';
import { InvoicesTable } from '@/components/billing/InvoicesTable';

export function BillingPage() {
  return (
    <>
      <Title order={2} mb="md">
        Billing
      </Title>
      <BalanceCard />
      <UsageChart />
      <KeyUsageTable />
      <InvoicesTable />
    </>
  );
}
