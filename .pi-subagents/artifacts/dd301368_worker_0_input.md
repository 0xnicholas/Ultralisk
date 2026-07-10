# Task for worker

Implement Tasks 8 + 9 + 10 together: API Keys, Billing, Settings/Profile

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

Tasks 1-7 done. Create all remaining pages.

## TASK 8: API Keys

**Create `packages/console-ui/src/api/apiKeys.ts`:**
```typescript
import { apiFetch } from './client';
import type { PaginatedResponse, ApiKey, ApiKeyCreated, CreateApiKeyRequest } from '@/types';

export async function getApiKeys() { return apiFetch<PaginatedResponse<ApiKey>>('/v1/admin/api-keys'); }
export async function createApiKey(data: CreateApiKeyRequest) { return apiFetch<{ data: ApiKeyCreated }>('/v1/admin/api-keys', { method: 'POST', body: JSON.stringify(data) }); }
export async function revokeApiKey(id: string) { return apiFetch<void>(`/v1/admin/api-keys/${id}`, { method: 'DELETE' }); }
```

**Create `packages/console-ui/src/hooks/useApiKeys.ts`:**
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiKeys, createApiKey, revokeApiKey } from '@/api/apiKeys';
import type { CreateApiKeyRequest } from '@/types';

export function useApiKeys() { return useQuery({ queryKey: ['api-keys'], queryFn: () => getApiKeys().then((r) => r.data), }); }
export function useCreateApiKey() { const qc = useQueryClient(); return useMutation({ mutationFn: (data: CreateApiKeyRequest) => createApiKey(data).then((r) => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }), }); }
export function useRevokeApiKey() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => revokeApiKey(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }), }); }
```

**Create `packages/console-ui/src/components/api-keys/KeyList.tsx`:**
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

  const handleRevoke = async () => { if (!revokeId) return; await revokeMutation.mutateAsync(revokeId); setRevokeId(null); };

  const rows = (keys ?? []).map((key: ApiKey) => (
    <Table.Tr key={key.id} style={{ opacity: key.status === 'revoked' ? 0.5 : 1 }}>
      <Table.Td><Text size="sm" fw={500}>{key.name}</Text>
        <Group gap={4}><Text size="xs" c="dimmed" ff="mono">{key.prefix}</Text>
          <CopyButton value={key.prefix} timeout={2000}>{({ copied, copy }) => (<Tooltip label={copied ? 'Copied' : 'Copy prefix'}><ActionIcon variant="subtle" size="xs" onClick={copy}>{copied ? <IconCheck size={10} /> : <IconCopy size={10} />}</ActionIcon></Tooltip>)}</CopyButton>
        </Group>
      </Table.Td>
      <Table.Td><Badge size="sm" variant="light" color={key.role === 'admin' ? 'red' : key.role === 'developer' ? 'blue' : 'gray'}>{key.role}</Badge></Table.Td>
      <Table.Td><Text size="sm">{formatCurrency(key.usage_this_month_usd)}</Text>{key.monthly_quota_usd && <Text size="xs" c="dimmed">/ {formatCurrency(key.monthly_quota_usd)} limit</Text>}</Table.Td>
      <Table.Td><Text size="sm">{formatRelativeTime(key.created_at)}</Text></Table.Td>
      <Table.Td><Badge color={key.status === 'active' ? 'green' : 'gray'} variant="dot" size="sm">{key.status}</Badge></Table.Td>
      <Table.Td>{key.status === 'active' && <ActionIcon variant="light" color="red" size="sm" onClick={() => setRevokeId(key.id)} loading={revokeMutation.isPending && revokeId === key.id}><IconTrash size={14} /></ActionIcon>}</Table.Td>
    </Table.Tr>
  ));

  return (
    <>
      <Table striped highlightOnHover>
        <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Role</Table.Th><Table.Th>Usage</Table.Th><Table.Th>Created</Table.Th><Table.Th>Status</Table.Th><Table.Th></Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>{isLoading ? Array.from({ length: 3 }).map((_, i) => <Table.Tr key={i}>{Array.from({ length: 6 }).map((_, j) => <Table.Td key={j}><Skeleton height={20} /></Table.Td>)}</Table.Tr>) : rows}</Table.Tbody>
      </Table>
      <Modal opened={!!revokeId} onClose={() => setRevokeId(null)} title="Revoke API Key" centered>
        <Text size="sm" mb="md">Are you sure you want to revoke this API key? This action cannot be undone. All requests using this key will fail immediately.</Text>
        <Group justify="flex-end"><Button variant="default" onClick={() => setRevokeId(null)}>Cancel</Button><Button color="red" onClick={handleRevoke} loading={revokeMutation.isPending}>Revoke Key</Button></Group>
      </Modal>
    </>
  );
}
```

**Create `packages/console-ui/src/components/api-keys/CreateKeyModal.tsx`:**
```typescript
import { useState } from 'react';
import { Modal, TextInput, Select, MultiSelect, NumberInput, Button, Group, Text, Alert, Code, CopyButton, ActionIcon } from '@mantine/core';
import { IconCheck, IconCopy, IconAlertCircle } from '@tabler/icons-react';
import { useCreateApiKey } from '@/hooks/useApiKeys';
import { useModels } from '@/hooks/useModels';

interface Props { opened: boolean; onClose: () => void; }

export function CreateKeyModal({ opened, onClose }: Props) {
  const [name, setName] = useState(''); const [role, setRole] = useState<'admin' | 'developer' | 'readonly'>('developer');
  const [modelAllowlist, setModelAllowlist] = useState<string[]>([]); const [monthlyQuota, setMonthlyQuota] = useState<number | undefined>();
  const createMutation = useCreateApiKey(); const { data: models } = useModels(); const [secret, setSecret] = useState<string | null>(null);
  const modelOptions = (models ?? []).map((m) => ({ value: m.id, label: m.display_name }));

  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); const result = await createMutation.mutateAsync({ name, role, model_allowlist: modelAllowlist.length > 0 ? modelAllowlist : undefined, monthly_quota_usd: monthlyQuota }); setSecret(result.secret); };
  const handleClose = () => { setName(''); setRole('developer'); setModelAllowlist([]); setMonthlyQuota(undefined); setSecret(null); onClose(); };

  return (
    <Modal opened={opened} onClose={handleClose} title="Create API Key" centered size="lg">
      {secret ? (
        <>
          <Alert icon={<IconAlertCircle size={16} />} color="yellow" variant="light" mb="md"><Text size="sm" fw={500}>Save this key now — you won't be able to see it again.</Text></Alert>
          <Group mb="md"><Code block style={{ flex: 1 }}>{secret}</Code><CopyButton value={secret} timeout={2000}>{({ copied, copy }) => (<ActionIcon color={copied ? 'teal' : 'gray'} variant="light" onClick={copy} size="lg">{copied ? <IconCheck size={18} /> : <IconCopy size={18} />}</ActionIcon>)}</CopyButton></Group>
          <Button fullWidth onClick={handleClose}>Done</Button>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <TextInput label="Key Name" placeholder="Production" required value={name} onChange={(e) => setName(e.currentTarget.value)} mb="sm" />
          <Select label="Role" data={[{ value: 'admin', label: 'Admin — full access' }, { value: 'developer', label: 'Developer — inference only' }, { value: 'readonly', label: 'Read-only — view only' }]} value={role} onChange={(v) => setRole(v as typeof role)} mb="sm" />
          <MultiSelect label="Model Allowlist (optional)" placeholder="All models available if empty" data={modelOptions} value={modelAllowlist} onChange={setModelAllowlist} searchable clearable mb="sm" />
          <NumberInput label="Monthly Quota (USD, optional)" placeholder="No limit" value={monthlyQuota ?? ''} onChange={(v) => setMonthlyQuota(typeof v === 'number' ? v : undefined)} min={0} mb="lg" />
          <Group justify="flex-end"><Button variant="default" onClick={handleClose}>Cancel</Button><Button type="submit" loading={createMutation.isPending} disabled={!name}>Create Key</Button></Group>
        </form>
      )}
    </Modal>
  );
}
```

**Create `packages/console-ui/src/pages/api-keys/ApiKeysPage.tsx`:**
```typescript
import { useState } from 'react';
import { Title, Button, Group, Paper } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { KeyList } from '@/components/api-keys/KeyList';
import { CreateKeyModal } from '@/components/api-keys/CreateKeyModal';

export function ApiKeysPage() {
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <>
      <Group justify="space-between" mb="md"><Title order={2}>API Keys</Title><Button leftSection={<IconPlus size={16} />} onClick={() => setCreateOpen(true)}>Create API Key</Button></Group>
      <Paper withBorder p="lg" radius="md"><KeyList /></Paper>
      <CreateKeyModal opened={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}
```

## TASK 9: Billing

**Create `packages/console-ui/src/components/billing/BalanceCard.tsx`:**
```typescript
import { Paper, Text, Group, Button, Stack, RingProgress } from '@mantine/core';
import { useBilling } from '@/hooks/useBilling';
import { formatCurrency } from '@/utils/format';

export function BalanceCard() {
  const { data: billing } = useBilling(); if (!billing) return null;
  const budgetPct = billing.monthly_budget_usd ? Math.min((billing.month_to_date_spend_usd / billing.monthly_budget_usd) * 100, 100) : 0;
  return (
    <Paper withBorder p="lg" radius="md" mb="md">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Stack gap="xs">
          <Text size="sm" fw={500} c="dimmed">Current Balance</Text><Text size="xl" fw={700}>{formatCurrency(billing.balance_usd)}</Text>
          <Group gap="xs"><Button size="xs" variant="light">Add Funds</Button>{billing.auto_recharge_enabled ? <Text size="xs" c="dimmed">Auto-recharge enabled</Text> : <Button size="xs" variant="subtle">Enable Auto-recharge</Button>}</Group>
        </Stack>
        {billing.monthly_budget_usd && (
          <Stack align="center" gap={4}>
            <Text size="xs" c="dimmed">Monthly Budget</Text>
            <RingProgress size={100} thickness={8} sections={[{ value: budgetPct, color: budgetPct > 90 ? 'red' : budgetPct > 75 ? 'yellow' : 'violet' }]} label={<Text size="xs" ta="center" fw={700}>{budgetPct.toFixed(0)}%</Text>} />
            <Text size="xs" c="dimmed">{formatCurrency(billing.month_to_date_spend_usd)} / {formatCurrency(billing.monthly_budget_usd)}</Text>
            <Text size="xs" c="dimmed">Est. month end: {formatCurrency(billing.estimated_month_end_usd)}</Text>
          </Stack>
        )}
      </Group>
    </Paper>
  );
}
```

**Create `packages/console-ui/src/components/billing/UsageChart.tsx`:**
```typescript
import { Paper, Text, SegmentedControl, Group, SimpleGrid } from '@mantine/core';
import { useState } from 'react';
import { DonutChart, BarChart } from '@mantine/charts';
import { useUsage } from '@/hooks/useUsage';

export function UsageChart() {
  const [range, setRange] = useState('today'); const { data: usage } = useUsage(range);
  const donutData = (usage?.by_model ?? []).map((m, i) => ({ name: m.model_display_name, value: m.cost_usd, color: ['violet', 'blue', 'green', 'orange', 'pink'][i] }));
  const barData = (usage?.by_model ?? []).map((m) => ({ model: m.model_display_name, 'Input Tokens': m.input_tokens, 'Output Tokens': m.output_tokens }));
  return (
    <Paper withBorder p="lg" radius="md" mb="md">
      <Group justify="space-between" mb="md"><Text size="sm" fw={500}>Usage</Text><SegmentedControl size="xs" data={[{ label: 'Today', value: 'today' }, { label: '7 Days', value: '7d' }, { label: '30 Days', value: '30d' }]} value={range} onChange={setRange} /></Group>
      {usage && (
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <div><Text size="xs" c="dimmed" ta="center" mb="sm">Cost by Model</Text><DonutChart data={donutData} size={180} thickness={20} withLabels withLabelsLine /></div>
          <div><Text size="xs" c="dimmed" ta="center" mb="sm">Tokens by Model</Text><BarChart h={180} data={barData} dataKey="model" series={[{ name: 'Input Tokens', color: 'violet.6' }, { name: 'Output Tokens', color: 'blue.6' }]} tickLine="none" gridAxis="y" /></div>
        </SimpleGrid>
      )}
    </Paper>
  );
}
```

**Create `packages/console-ui/src/components/billing/InvoicesTable.tsx`:**
```typescript
import { Paper, Text, Table, Badge } from '@mantine/core';
import { useBilling } from '@/hooks/useBilling';
import { formatCurrency } from '@/utils/format';

export function InvoicesTable() {
  const { data: billing } = useBilling(); if (!billing?.invoices?.length) return null;
  return (
    <Paper withBorder p="lg" radius="md" mb="md">
      <Text size="sm" fw={500} mb="sm">Invoices</Text>
      <Table striped highlightOnHover>
        <Table.Thead><Table.Tr><Table.Th>Period</Table.Th><Table.Th>Amount</Table.Th><Table.Th>Status</Table.Th><Table.Th>Issued</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>{billing.invoices.map((inv) => (<Table.Tr key={inv.id}><Table.Td>{inv.period}</Table.Td><Table.Td>{formatCurrency(inv.amount_usd)}</Table.Td><Table.Td><Badge size="sm" variant="light" color={inv.status === 'paid' ? 'green' : inv.status === 'overdue' ? 'red' : 'yellow'}>{inv.status}</Badge></Table.Td><Table.Td>{new Date(inv.issued_at).toLocaleDateString()}</Table.Td></Table.Tr>))}</Table.Tbody>
      </Table>
    </Paper>
  );
}
```

**Create `packages/console-ui/src/components/billing/KeyUsageTable.tsx`:**
```typescript
import { Table, Text, Paper } from '@mantine/core';
import { useUsage } from '@/hooks/useUsage';
import { formatCurrency, formatTokens } from '@/utils/format';

export function KeyUsageTable() {
  const { data: usage } = useUsage(); if (!usage?.by_key?.length) return null;
  return (
    <Paper withBorder p="lg" radius="md">
      <Text size="sm" fw={500} mb="sm">Usage by API Key</Text>
      <Table striped highlightOnHover>
        <Table.Thead><Table.Tr><Table.Th>Key</Table.Th><Table.Th>Requests</Table.Th><Table.Th>Input Tokens</Table.Th><Table.Th>Output Tokens</Table.Th><Table.Th>Cost</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>{usage.by_key.map((k) => (<Table.Tr key={k.key_id}><Table.Td><Text size="sm" fw={500}>{k.key_name}</Text><Text size="xs" c="dimmed" ff="mono">{k.key_prefix}</Text></Table.Td><Table.Td>{k.requests.toLocaleString()}</Table.Td><Table.Td>{formatTokens(k.input_tokens)}</Table.Td><Table.Td>{formatTokens(k.output_tokens)}</Table.Td><Table.Td>{formatCurrency(k.cost_usd)}</Table.Td></Table.Tr>))}</Table.Tbody>
      </Table>
    </Paper>
  );
}
```

**Create `packages/console-ui/src/pages/billing/BillingPage.tsx`:**
```typescript
import { Title } from '@mantine/core';
import { BalanceCard } from '@/components/billing/BalanceCard';
import { UsageChart } from '@/components/billing/UsageChart';
import { KeyUsageTable } from '@/components/billing/KeyUsageTable';
import { InvoicesTable } from '@/components/billing/InvoicesTable';

export function BillingPage() {
  return (
    <>
      <Title order={2} mb="md">Billing</Title>
      <BalanceCard />
      <UsageChart />
      <KeyUsageTable />
      <InvoicesTable />
    </>
  );
}
```

## TASK 10: Settings/Profile

**Create `packages/console-ui/src/pages/settings/ProfilePage.tsx`:**
```typescript
import { Title, Paper, TextInput, Button, Group, SegmentedControl, useMantineColorScheme } from '@mantine/core';
import { useAuth } from '@/stores/AuthContext';
import { useState } from 'react';

export function ProfilePage() {
  const { user } = useAuth(); const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [name, setName] = useState(user?.name ?? ''); const [saved, setSaved] = useState(false);
  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  return (
    <>
      <Title order={2} mb="md">Profile</Title>
      <Paper withBorder p="lg" radius="md" mb="md">
        <Title order={4} mb="sm">Personal Information</Title>
        <TextInput label="Email" value={user?.email ?? ''} disabled mb="sm" />
        <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} mb="md" />
        <Group><Button onClick={handleSave}>{saved ? 'Saved!' : 'Save Changes'}</Button></Group>
      </Paper>
      <Paper withBorder p="lg" radius="md">
        <Title order={4} mb="sm">Appearance</Title>
        <SegmentedControl value={colorScheme} onChange={(v) => setColorScheme(v as 'light' | 'dark' | 'auto')} data={[{ label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }, { label: 'System', value: 'auto' }]} />
      </Paper>
    </>
  );
}
```

## Add all routes to App.tsx

Edit `packages/console-ui/src/App.tsx`. Read the file first, then add these imports and routes.

Add imports:
```typescript
import { ApiKeysPage } from '@/pages/api-keys/ApiKeysPage';
import { BillingPage } from '@/pages/billing/BillingPage';
import { ProfilePage } from '@/pages/settings/ProfilePage';
```

Add routes inside the ConsoleLayout Route:
```typescript
<Route path="/api-keys" element={<ApiKeysPage />} />
<Route path="/billing" element={<BillingPage />} />
<Route path="/settings/profile" element={<ProfilePage />} />
```

## Verify typecheck and commit

```bash
cd packages/console-ui && pnpm typecheck
```
Fix any errors.

```bash
git add packages/console-ui/src
git commit -m "feat: add API Keys, Billing, and Settings/Profile pages"
```

## Acceptance Contract
Acceptance level: attested
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Return concrete findings with file paths and severity when applicable

Required evidence: review-findings, residual-risks

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