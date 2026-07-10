# Task for worker

You are implementing Task 6: Models Page

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

Tasks 1-5 done. Create the Models page components.

## Step 1: Create api/models.ts and hooks/useModels.ts

Create `packages/console-ui/src/api/models.ts`:
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

Create `packages/console-ui/src/hooks/useModels.ts`:
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

## Step 2: Create FeaturedModels

Create `packages/console-ui/src/components/models/FeaturedModels.tsx`:
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
          <Button size="xs" variant="light" onClick={() => navigate(`/playground?model=${model.id}`)}>Open in Playground</Button>
          <Button size="xs" variant="subtle" onClick={() => navigate(`/models/${model.id}`)}>View Details</Button>
        </Group>
      </Stack>
    </Paper>
  );
}

export function FeaturedModels() {
  const { data: models, isLoading } = useModels();
  if (isLoading) {
    return <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="md">{[1,2,3,4].map((i) => <Skeleton key={i} height={160} radius="md" />)}</SimpleGrid>;
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

## Step 3: Create ModelFilters

Create `packages/console-ui/src/components/models/ModelFilters.tsx`:
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
        <SegmentedControl size="xs" data={[{ label: 'All', value: '' }, { label: 'Serverless', value: 'serverless' }, { label: 'Dedicated', value: 'dedicated' }]} value={filters.deployment ?? ''} onChange={(v) => onChange({ ...filters, deployment: v })} />
      </div>
      <div>
        <Text size="xs" fw={500} c="dimmed" mb={4}>Category</Text>
        <SegmentedControl size="xs" data={[{ label: 'All', value: '' }, { label: 'Chat', value: 'chat' }, { label: 'Embedding', value: 'embedding' }, { label: 'Vision', value: 'image' }]} value={filters.category ?? ''} onChange={(v) => onChange({ ...filters, category: v })} />
      </div>
      <div>
        <Text size="xs" fw={500} c="dimmed" mb={4}>Features</Text>
        <SegmentedControl size="xs" data={[{ label: 'All', value: '' }, { label: 'JSON Mode', value: 'json_mode' }, { label: 'Tool Calling', value: 'tool_calling' }, { label: 'Multi-Modal', value: 'multi_modal' }]} value={filters.feature ?? ''} onChange={(v) => onChange({ ...filters, feature: v })} />
      </div>
    </Group>
  );
}
```

## Step 4: Create ModelsTable

Create `packages/console-ui/src/components/models/ModelsTable.tsx`:
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
      <Table.Td><Text fw={500} size="sm">{m.display_name}</Text><Text size="xs" c="dimmed">{m.id}</Text></Table.Td>
      <Table.Td>{m.author}</Table.Td>
      <Table.Td><Badge variant="light" size="sm">{m.category}</Badge></Table.Td>
      <Table.Td><Text size="sm">{formatCurrency(m.pricing.serverless.input_per_1m_tokens)} / {formatCurrency(m.pricing.serverless.output_per_1m_tokens)}</Text><Text size="xs" c="dimmed">per 1M tokens</Text></Table.Td>
      <Table.Td>{m.pricing.batch_discount_percent && <Badge variant="outline" size="xs" color="green">{m.pricing.batch_discount_percent}% off batch</Badge>}</Table.Td>
      <Table.Td><Badge color={m.status === 'available' ? 'green' : m.status === 'degraded' ? 'yellow' : 'red'} variant="dot" size="sm">{m.status}</Badge></Table.Td>
      <Table.Td>
        <Group gap={4}>
          <ActionIcon variant="light" size="sm" onClick={() => navigate(`/playground?model=${m.id}`)} title="Open in Playground"><IconPlayerPlay size={14} /></ActionIcon>
          <ActionIcon variant="light" size="sm" onClick={() => navigate(`/models/${m.id}`)} title="View Details"><IconFileText size={14} /></ActionIcon>
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
            <Table.Th>Model</Table.Th><Table.Th>Author</Table.Th><Table.Th>Category</Table.Th><Table.Th>Serverless Pricing</Table.Th><Table.Th>Batch</Table.Th><Table.Th>Status</Table.Th><Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {isLoading ? Array.from({ length: 5 }).map((_, i) => <Table.Tr key={i}>{Array.from({ length: 7 }).map((_, j) => <Table.Td key={j}><Skeleton height={20} /></Table.Td>)}</Table.Tr>) : rows}
        </Table.Tbody>
      </Table>
    </>
  );
}
```

## Step 5: Create ModelsPage

Create `packages/console-ui/src/pages/models/ModelsPage.tsx`:
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

## Step 6: Create ModelDetailPage

Create `packages/console-ui/src/pages/models/ModelDetailPage.tsx`:
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
      <Group mb="md"><Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/models')}>Back to Models</Button></Group>
      <Title order={2} mb="xs">{model.display_name}</Title>
      <Text c="dimmed" mb="md">{model.description}</Text>
      <SimpleGrid cols={{ base: 1, md: 2 }} mb="lg">
        <Paper withBorder p="lg" radius="md">
          <Title order={4} mb="sm">Capabilities</Title>
          <Stack gap="xs">
            <Group><Text size="sm" fw={500}>Context Window:</Text><Text size="sm">{model.capabilities.context_window.toLocaleString()} tokens</Text></Group>
            <Group><Text size="sm" fw={500}>Max Output:</Text><Text size="sm">{model.capabilities.max_output_tokens.toLocaleString()} tokens</Text></Group>
            <Group gap={4}><Text size="sm" fw={500}>Features:</Text>
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
            {model.pricing.serverless.cached_input_per_1m_tokens && <Group><Text size="sm" fw={500}>Cached Input:</Text><Text size="sm">{formatCurrency(model.pricing.serverless.cached_input_per_1m_tokens)} / 1M tokens</Text></Group>}
            {model.pricing.batch_discount_percent && <Group><Text size="sm" fw={500}>Batch Discount:</Text><Badge color="green">{model.pricing.batch_discount_percent}% off</Badge></Group>}
            {model.pricing.dedicated && <Group><Text size="sm" fw={500}>Dedicated:</Text><Text size="sm">{model.pricing.dedicated.gpu_type} @ {formatCurrency(model.pricing.dedicated.price_per_hour)}/hr</Text></Group>}
          </Stack>
        </Paper>
      </SimpleGrid>
      <Paper withBorder p="lg" radius="md" mb="md">
        <Title order={4} mb="sm">Quick Start</Title>
        <Text size="xs" c="dimmed" mb="sm">Use with OpenAI-compatible SDKs:</Text>
        <Code block mb="sm">{model.usage_examples.python}</Code>
      </Paper>
      <Button leftSection={<IconPlayerPlay size={16} />} onClick={() => navigate(`/playground?model=${model.id}`)}>Open in Playground</Button>
    </>
  );
}
```

## Step 7: Add routes to App.tsx

Edit `packages/console-ui/src/App.tsx` — add these imports:
```typescript
import { ModelsPage } from '@/pages/models/ModelsPage';
import { ModelDetailPage } from '@/pages/models/ModelDetailPage';
```

And add these routes inside the ConsoleLayout route:
```typescript
<Route path="/models" element={<ModelsPage />} />
<Route path="/models/:modelId" element={<ModelDetailPage />} />
```

## Step 8: Verify typecheck and commit

```bash
cd packages/console-ui && pnpm typecheck
```
Expected: No errors.

```bash
git add packages/console-ui/src
git commit -m "feat: add Models page with featured cards, filters, table, and detail page"
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