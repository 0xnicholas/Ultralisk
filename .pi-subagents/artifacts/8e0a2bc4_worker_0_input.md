# Task for worker

You are implementing Task 4: Batch Jobs Page

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

Tasks 1-3 done. Create all Batch Jobs page components.

## Step 1: Create API and hooks

Create `packages/console-ui/src/api/batchJobs.ts`:
```typescript
import { apiFetch } from './client';
import type { PaginatedResponse, SingleResponse, BatchJob, CreateBatchJobRequest } from '@/types';

export async function getBatchJobs() { return apiFetch<PaginatedResponse<BatchJob>>('/v1/admin/batch-jobs'); }
export async function getBatchJob(id: string) { return apiFetch<SingleResponse<BatchJob>>(`/v1/admin/batch-jobs/${id}`); }
export async function createBatchJob(data: CreateBatchJobRequest) { return apiFetch<SingleResponse<BatchJob>>('/v1/admin/batch-jobs', { method: 'POST', body: JSON.stringify(data) }); }
export async function cancelBatchJob(id: string) { return apiFetch<void>(`/v1/admin/batch-jobs/${id}`, { method: 'DELETE' }); }
```

Create `packages/console-ui/src/hooks/useBatchJobs.ts`:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBatchJobs, getBatchJob, createBatchJob, cancelBatchJob } from '@/api/batchJobs';
import type { CreateBatchJobRequest } from '@/types';

export function useBatchJobs() { return useQuery({ queryKey: ['batch-jobs'], queryFn: () => getBatchJobs().then((r) => r.data) }); }
export function useBatchJob(id: string) { return useQuery({ queryKey: ['batch-jobs', id], queryFn: () => getBatchJob(id).then((r) => r.data), enabled: !!id }); }
export function useCreateBatchJob() { const qc = useQueryClient(); return useMutation({ mutationFn: (d: CreateBatchJobRequest) => createBatchJob(d).then((r) => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['batch-jobs'] }) }); }
export function useCancelBatchJob() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => cancelBatchJob(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['batch-jobs'] }) }); }
```

## Step 2: Create BatchJobList

Create `packages/console-ui/src/components/batch-jobs/BatchJobList.tsx`:
```typescript
import { Table, Badge, Text, Group, ActionIcon, Skeleton, Tooltip } from '@mantine/core';
import { IconEye, IconX, IconDownload } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useBatchJobs, useCancelBatchJob } from '@/hooks/useBatchJobs';
import { formatCurrency, formatTokens } from '@/utils/format';
import type { BatchJob } from '@/types';

const statusColor: Record<string, string> = { pending: 'gray', running: 'blue', completed: 'green', failed: 'red' };

export function BatchJobList() {
  const { data: jobs, isLoading } = useBatchJobs();
  const cancelMutation = useCancelBatchJob();
  const navigate = useNavigate();

  const rows = (jobs ?? []).map((job: BatchJob) => (
    <Table.Tr key={job.id}>
      <Table.Td><Text size="sm" fw={500}>{job.name}</Text></Table.Td>
      <Table.Td><Text size="xs" c="dimmed">{job.model_id}</Text></Table.Td>
      <Table.Td><Badge variant="light" color={statusColor[job.status]} size="sm">{job.status}</Badge></Table.Td>
      <Table.Td><Text size="sm">{job.token_count ? formatTokens(job.token_count) : '-'}</Text></Table.Td>
      <Table.Td><Text size="sm">{job.cost ? formatCurrency(job.cost) : '-'}</Text></Table.Td>
      <Table.Td><Text size="xs" c="dimmed">{new Date(job.created_at).toLocaleString()}</Text></Table.Td>
      <Table.Td>
        <Group gap={4}>
          <Tooltip label="View details"><ActionIcon variant="light" size="sm" onClick={() => navigate(`/batch-jobs/${job.id}`)}><IconEye size={14} /></ActionIcon></Tooltip>
          {(job.status === 'running' || job.status === 'pending') ? (
            <Tooltip label="Cancel"><ActionIcon variant="light" color="red" size="sm" onClick={() => cancelMutation.mutate(job.id)}><IconX size={14} /></ActionIcon></Tooltip>
          ) : job.output_file ? <Tooltip label="Download"><ActionIcon variant="light" size="sm"><IconDownload size={14} /></ActionIcon></Tooltip> : null}
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Table striped highlightOnHover>
      <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Model</Table.Th><Table.Th>Status</Table.Th><Table.Th>Tokens</Table.Th><Table.Th>Cost</Table.Th><Table.Th>Submitted</Table.Th><Table.Th></Table.Th></Table.Tr></Table.Thead>
      <Table.Tbody>{isLoading ? [1,2,3].map((i) => <Table.Tr key={i}>{[1,2,3,4,5,6,7].map((j) => <Table.Td key={j}><Skeleton height={20} /></Table.Td>)}</Table.Tr>) : rows}</Table.Tbody>
    </Table>
  );
}
```

## Step 3: Create CreateBatchJobPage

Create `packages/console-ui/src/pages/batch-jobs/CreateBatchJobPage.tsx` (overwrite placeholder):
```typescript
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Title, Paper, TextInput, Select, FileInput, Button, Group, Stack, Text, Alert } from '@mantine/core';
import { IconArrowLeft, IconAlertCircle } from '@tabler/icons-react';
import { useCreateBatchJob } from '@/hooks/useBatchJobs';
import { useModels } from '@/hooks/useModels';

export function CreateBatchJobPage() {
  const navigate = useNavigate();
  const createMutation = useCreateBatchJob();
  const { data: models } = useModels();
  const [name, setName] = useState('');
  const [modelId, setModelId] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [callbackUrl, setCallbackUrl] = useState('');
  const modelOptions = (models ?? []).map((m: any) => ({ value: m.id, label: m.display_name }));

  const handleFileChange = (file: File | null) => { if (file) setFileContent(`mock://uploads/${file.name}`); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMutation.mutateAsync({ name, model_id: modelId, input_file: fileContent, callback_url: callbackUrl || undefined });
    navigate('/batch-jobs', { replace: true });
  };

  return (
    <>
      <Group mb="md"><Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/batch-jobs')}>Back</Button></Group>
      <Title order={2} mb="md">Create Batch Job</Title>
      <Paper withBorder p="lg" radius="md" maw={560}>
        <form onSubmit={handleSubmit}>
          <Stack>
            <TextInput label="Job Name" placeholder="my-batch-job" required value={name} onChange={(e) => setName(e.currentTarget.value)} />
            <Select label="Model" placeholder="Select" data={modelOptions} value={modelId} onChange={(v) => v && setModelId(v)} searchable required />
            <FileInput label="Input File (JSONL)" placeholder="Upload JSONL" accept=".jsonl,.json" onChange={handleFileChange} required />
            {fileContent && <Alert icon={<IconAlertCircle size={16} />} color="blue" variant="light"><Text size="xs">Accepted: {fileContent.replace('mock://uploads/', '')}</Text></Alert>}
            <Select label="Output Format" data={[{ value: 'jsonl', label: 'JSONL' }, { value: 'json', label: 'JSON' }]} defaultValue="jsonl" />
            <TextInput label="Callback URL (optional)" placeholder="https://hooks.example.com/done" value={callbackUrl} onChange={(e) => setCallbackUrl(e.currentTarget.value)} />
            <Group justify="flex-end"><Button variant="default" onClick={() => navigate('/batch-jobs')}>Cancel</Button><Button type="submit" loading={createMutation.isPending}>Create</Button></Group>
          </Stack>
        </form>
      </Paper>
    </>
  );
}
```

## Step 4: Create BatchJobsPage

Create `packages/console-ui/src/pages/batch-jobs/BatchJobsPage.tsx` (overwrite placeholder):
```typescript
import { Title, Button, Group, Paper } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { BatchJobList } from '@/components/batch-jobs/BatchJobList';

export function BatchJobsPage() {
  const navigate = useNavigate();
  return (
    <>
      <Group justify="space-between" mb="md"><Title order={2}>Batch Jobs</Title><Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/batch-jobs/new')}>Create Batch Job</Button></Group>
      <Paper withBorder p="lg" radius="md"><BatchJobList /></Paper>
    </>
  );
}
```

## Step 5: Create BatchJobDetailPage

Create `packages/console-ui/src/pages/batch-jobs/BatchJobDetailPage.tsx` (overwrite placeholder):
```typescript
import { useParams, useNavigate } from 'react-router-dom';
import { Title, Paper, Text, Group, Button, Skeleton, Stack, Badge, Code } from '@mantine/core';
import { IconArrowLeft, IconDownload } from '@tabler/icons-react';
import { useBatchJob, useCancelBatchJob } from '@/hooks/useBatchJobs';
import { formatCurrency, formatTokens } from '@/utils/format';

const statusColor: Record<string, string> = { pending: 'gray', running: 'blue', completed: 'green', failed: 'red' };

export function BatchJobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: job, isLoading } = useBatchJob(id ?? '');
  const cancelMutation = useCancelBatchJob();

  if (isLoading) return <Skeleton height={400} />;
  if (!job) return <Text c="red">Batch job not found</Text>;

  return (
    <>
      <Group mb="md"><Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/batch-jobs')}>Back</Button></Group>
      <Group justify="space-between" mb="md">
        <div><Title order={2}>{job.name}</Title><Group gap="xs"><Text c="dimmed" size="sm">{job.model_id}</Text><Badge variant="light" color={statusColor[job.status]}>{job.status}</Badge></Group></div>
        {((job.status === 'running' || job.status === 'pending') ? <Button color="red" variant="light" onClick={() => cancelMutation.mutate(id!)} loading={cancelMutation.isPending}>Cancel</Button> : job.output_file ? <Button leftSection={<IconDownload size={16} />}>Download</Button> : null)}
      </Group>
      <Paper withBorder p="lg" radius="md" mb="md">
        <Text size="sm" fw={500} mb="sm">Details</Text>
        <Stack gap="xs">
          <Group><Text size="sm" fw={500}>Input:</Text><Text size="sm">{job.input_file}</Text></Group>
          {job.output_file && <Group><Text size="sm" fw={500}>Output:</Text><Text size="sm">{job.output_file}</Text></Group>}
          {job.callback_url && <Group><Text size="sm" fw={500}>Callback:</Text><Text size="sm">{job.callback_url}</Text></Group>}
          <Group><Text size="sm" fw={500}>Tokens:</Text><Text size="sm">{job.token_count ? formatTokens(job.token_count) : '-'}</Text></Group>
          <Group><Text size="sm" fw={500}>Cost:</Text><Text size="sm">{job.cost ? formatCurrency(job.cost) : 'Pending'}</Text></Group>
          <Group><Text size="sm" fw={500}>Created:</Text><Text size="sm">{new Date(job.created_at).toLocaleString()}</Text></Group>
          {job.completed_at && <Group><Text size="sm" fw={500}>Completed:</Text><Text size="sm">{new Date(job.completed_at).toLocaleString()}</Text></Group>}
        </Stack>
      </Paper>
      {job.error_log && job.error_log.length > 0 && (
        <Paper withBorder p="lg" radius="md">
          <Text size="sm" fw={500} mb="sm" c="red">Errors ({job.error_log.length})</Text>
          {job.error_log.map((err, i) => (<Group key={i} mb={4}><Badge size="xs" color="red">Line {err.line}</Badge><Code>{err.error}</Code></Group>))}
        </Paper>
      )}
    </>
  );
}
```

## Step 6: Verify typecheck and commit

```bash
cd packages/console-ui && pnpm typecheck
git add packages/console-ui/src
git commit -m "feat: add Batch Jobs page with list, create form, detail view, and error log"
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