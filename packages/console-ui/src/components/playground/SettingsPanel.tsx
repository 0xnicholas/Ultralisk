import { Stack, Paper, Title, Slider, TextInput, Select, Textarea, Text } from '@mantine/core';

interface Params { max_tokens: number; temperature: number; top_p: number; stop: string[]; frequency_penalty: number; presence_penalty: number; response_format: 'text' | 'json_object'; }

interface Props { params: Params; onChange: (p: Params) => void; systemPrompt: string; onSystemPromptChange: (s: string) => void; }

export function SettingsPanel({ params, onChange, systemPrompt, onSystemPromptChange }: Props) {
  const update = (patch: Partial<Params>) => onChange({ ...params, ...patch });
  return (
    <Paper withBorder style={{ width: 280, flexShrink: 0, overflow: 'auto' }} p="md" ml="md">
      <Title order={5} mb="md">Settings</Title>
      <Stack gap="md">
        <Textarea label="System Prompt" placeholder="You are a helpful assistant." minRows={3} maxRows={5} value={systemPrompt} onChange={(e) => onSystemPromptChange(e.currentTarget.value)} />
        <div><Text size="sm" fw={500} mb={4}>Max Tokens</Text><Slider min={16} max={4096} step={16} value={params.max_tokens} onChange={(v) => update({ max_tokens: v })} marks={[{ value: 512, label: '512' }, { value: 2048, label: '2K' }, { value: 4096, label: '4K' }]} /></div>
        <div><Text size="sm" fw={500} mb={4}>Temperature ({params.temperature})</Text><Slider min={0} max={2} step={0.01} value={params.temperature} onChange={(v) => update({ temperature: v })} /></div>
        <div><Text size="sm" fw={500} mb={4}>Top P ({params.top_p})</Text><Slider min={0} max={1} step={0.01} value={params.top_p} onChange={(v) => update({ top_p: v })} /></div>
        <TextInput label="Stop Sequences" placeholder="Comma-separated" value={params.stop.join(', ')} onChange={(e) => update({ stop: e.currentTarget.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
        <div><Text size="sm" fw={500} mb={4}>Frequency Penalty ({params.frequency_penalty})</Text><Slider min={-2} max={2} step={0.01} value={params.frequency_penalty} onChange={(v) => update({ frequency_penalty: v })} /></div>
        <div><Text size="sm" fw={500} mb={4}>Presence Penalty ({params.presence_penalty})</Text><Slider min={-2} max={2} step={0.01} value={params.presence_penalty} onChange={(v) => update({ presence_penalty: v })} /></div>
        <Select label="Response Format" data={[{ value: 'text', label: 'Text' }, { value: 'json_object', label: 'JSON Object' }]} value={params.response_format} onChange={(v) => update({ response_format: (v as 'text' | 'json_object') ?? 'text' })} />
      </Stack>
    </Paper>
  );
}
