import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Title,
  Paper,
  TextInput,
  Select,
  FileInput,
  Button,
  Group,
  Stack,
  Text,
  Alert,
} from '@mantine/core';
import { IconArrowLeft, IconAlertCircle } from '@tabler/icons-react';
import { useCreateBatchJob } from '@/hooks/useBatchJobs';
import { useModels } from '@/hooks/useModels';

export function CreateBatchJobPage() {
  const navigate = useNavigate();
  const createMutation = useCreateBatchJob();
  const { data: models } = useModels();
  const [name, setName] = useState('');
  const [modelId, setModelId] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [callbackUrl, setCallbackUrl] = useState('');
  const modelOptions = (models ?? []).map((m: any) => ({
    value: m.id,
    label: m.display_name,
  }));

  const handleFileChange = (file: File | null) => {
    if (file) setFileContent(`mock://uploads/${file.name}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelId) return;
    await createMutation.mutateAsync({
      name,
      model_id: modelId,
      input_file: fileContent,
      callback_url: callbackUrl || undefined,
    });
    navigate('/batch-jobs', { replace: true });
  };

  return (
    <>
      <Group mb="md">
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => navigate('/batch-jobs')}
        >
          Back
        </Button>
      </Group>
      <Title order={2} mb="md">
        Create Batch Job
      </Title>
      <Paper withBorder p="lg" radius="md" maw={560}>
        <form onSubmit={handleSubmit}>
          <Stack>
            <TextInput
              label="Job Name"
              placeholder="my-batch-job"
              required
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
            <Select
              label="Model"
              placeholder="Select"
              data={modelOptions}
              value={modelId}
              onChange={(v) => setModelId(v)}
              searchable
              required
            />
            <FileInput
              label="Input File (JSONL)"
              placeholder="Upload JSONL"
              accept=".jsonl,.json"
              onChange={handleFileChange}
              required
            />
            {fileContent && (
              <Alert
                icon={<IconAlertCircle size={16} />}
                color="blue"
                variant="light"
              >
                <Text size="xs">
                  Accepted: {fileContent.replace('mock://uploads/', '')}
                </Text>
              </Alert>
            )}
            <Select
              label="Output Format"
              data={[
                { value: 'jsonl', label: 'JSONL' },
                { value: 'json', label: 'JSON' },
              ]}
              defaultValue="jsonl"
            />
            <TextInput
              label="Callback URL (optional)"
              placeholder="https://hooks.example.com/done"
              value={callbackUrl}
              onChange={(e) => setCallbackUrl(e.currentTarget.value)}
            />
            <Group justify="flex-end">
              <Button
                variant="default"
                onClick={() => navigate('/batch-jobs')}
              >
                Cancel
              </Button>
              <Button type="submit" loading={createMutation.isPending}>
                Create
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>
    </>
  );
}
