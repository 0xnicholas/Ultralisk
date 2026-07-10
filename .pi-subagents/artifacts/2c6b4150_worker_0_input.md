# Task for worker

You are implementing Task 5: Dashboard Page

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

Tasks 1-4 are done. The API stub is running and types are defined. Create the Dashboard page and all its sub-components.

## Step 1: Create utils/format.ts

Create `packages/console-ui/src/utils/format.ts`:
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

## Step 2: Create api/usage.ts, api/billing.ts, hooks/useUsage.ts, hooks/useBilling.ts

Create `packages/console-ui/src/api/usage.ts`:
```typescript
import { apiFetch } from './client';
import type { SingleResponse, UsageSummary } from '@/types';

export async function getUsage(range = 'today') {
  return apiFetch<SingleResponse<UsageSummary>>(`/v1/admin/usage?range=${range}`);
}
```

Create `packages/console-ui/src/api/billing.ts`:
```typescript
import { apiFetch } from './client';
import type { SingleResponse, Billing } from '@/types';

export async function getBilling() {
  return apiFetch<SingleResponse<Billing>>('/v1/admin/billing');
}
```

Create `packages/console-ui/src/hooks/useUsage.ts`:
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

Create `packages/console-ui/src/hooks/useBilling.ts`:
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

## Step 3: Create dashboard components

Create ALL of these files — each one exactly as specified:

**`packages/console-ui/src/components/dashboard/AccountStatusBanner.tsx`:**
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

**`packages/console-ui/src/components/dashboard/DeveloperQuickstart.tsx`:**
```typescript
import { useState } from 'react';
import { Paper, Title, SegmentedControl, Code, CopyButton, ActionIcon, Group } from '@mantine/core';
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

**`packages/console-ui/src/components/dashboard/UsageSummaryCards.tsx`:**
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
    { label: "Today's Requests", value: usage ? formatNumber(usage.totals.requests) : '-', icon: IconArrowsExchange, color: 'blue' },
    { label: "Today's Tokens", value: usage ? formatTokens(usage.totals.input_tokens + usage.totals.output_tokens) : '-', icon: IconCoins, color: 'violet' },
    { label: "Today's Cost", value: usage ? formatCurrency(usage.totals.cost_usd) : '-', icon: IconCash, color: 'green' },
    { label: 'Balance', value: billing ? formatCurrency(billing.balance_usd) : '-', icon: IconWallet, color: 'orange' },
  ];

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="md">
      {cards.map((card) => (
        <Paper withBorder p="md" radius="md" key={card.label}>
          {loading ? <Skeleton height={50} /> : (
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

**`packages/console-ui/src/components/dashboard/QuickActions.tsx`:**
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
          <Paper key={action.label} withBorder p="md" radius="md" style={{ cursor: 'pointer' }}
            onClick={() => action.external ? window.open(action.path, '_blank') : navigate(action.path)}>
            <Group>
              <ThemeIcon variant="light" color={action.color} size="lg"><action.icon size={20} /></ThemeIcon>
              <Text size="sm" fw={500}>{action.label}</Text>
            </Group>
          </Paper>
        ))}
      </SimpleGrid>
    </>
  );
}
```

**`packages/console-ui/src/components/dashboard/RecentActivity.tsx`:**
```typescript
import { Paper, Text, Table, Badge } from '@mantine/core';
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
            <Table.Th>Time</Table.Th><Table.Th>Model</Table.Th><Table.Th>Status</Table.Th><Table.Th>Latency</Table.Th><Table.Th>Tokens</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {usage.recent_activity.slice(0, 10).map((item, i) => (
            <Table.Tr key={i}>
              <Table.Td>{formatRelativeTime(item.timestamp)}</Table.Td>
              <Table.Td>{item.model_id}</Table.Td>
              <Table.Td><Badge color={item.status_code < 400 ? 'green' : item.status_code < 500 ? 'yellow' : 'red'} variant="light">{item.status_code}</Badge></Table.Td>
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

**`packages/console-ui/src/components/dashboard/ExamplesResources.tsx`:**
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
            <ThemeIcon variant="light" color={ex.color} size="lg" mb="sm"><ex.icon size={20} /></ThemeIcon>
            <Text fw={500} size="sm">{ex.title}</Text>
            <Text size="xs" c="dimmed">{ex.description}</Text>
          </Paper>
        ))}
      </SimpleGrid>
    </>
  );
}
```

## Step 4: Create DashboardPage

Create `packages/console-ui/src/pages/dashboard/DashboardPage.tsx`:
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

## Step 5: Add Dashboard route to App.tsx

Edit `packages/console-ui/src/App.tsx` — add this import near the top:
```typescript
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
```

And add this route inside the ConsoleLayout route element (after the index route):
```typescript
<Route path="/dashboard" element={<DashboardPage />} />
```

The resulting section should look like:
```typescript
<Route
  element={
    <AuthGuard>
      <ConsoleLayout />
    </AuthGuard>
  }
>
  <Route index element={<Navigate to="/dashboard" replace />} />
  <Route path="/dashboard" element={<DashboardPage />} />
</Route>
```

## Step 6: Verify typecheck

```bash
cd packages/console-ui && pnpm typecheck
```
Expected: No errors.

## Step 7: Commit

```bash
git add packages/console-ui/src
git commit -m "feat: add Dashboard page with account banner, quickstart, usage cards, activity, and examples"
```

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