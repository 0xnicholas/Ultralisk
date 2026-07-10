import { useState } from 'react';
import { Modal, SegmentedControl, Group, Code, CopyButton, ActionIcon, Paper } from '@mantine/core';
import { IconCopy, IconCheck } from '@tabler/icons-react';
import type { ChatMessage } from '@/types';

interface Props { opened: boolean; onClose: () => void; model: string; messages: ChatMessage[]; params: Record<string, unknown>; }

function generateCurl(model: string, messages: ChatMessage[], params: Record<string, unknown>): string {
  const body = JSON.stringify({ model, messages, ...params }, null, 2);
  return `curl https://api.ultralisk.com/v1/chat/completions \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer $ULTRALISK_API_KEY" \\\n  -d '${body}'`;
}

function generatePython(model: string, messages: ChatMessage[], params: Record<string, unknown>): string {
  const msgsStr = messages.map((m) => `    {"role": "${m.role}", "content": "${m.content}"}`).join(',\n');
  return `from openai import OpenAI\n\nclient = OpenAI(\n    base_url="https://api.ultralisk.com/v1",\n    api_key="your-api-key"\n)\n\nresponse = client.chat.completions.create(\n    model="${model}",\n    messages=[\n${msgsStr}\n    ],\n    temperature=${params.temperature ?? 0.7},\n    max_tokens=${params.max_tokens ?? 512}\n)\nprint(response.choices[0].message.content)`;
}

function generateTypeScript(model: string, messages: ChatMessage[], params: Record<string, unknown>): string {
  const msgsStr = messages.map((m) => `    { role: '${m.role}', content: '${m.content}' }`).join(',\n');
  return `import OpenAI from 'openai';\n\nconst client = new OpenAI({\n  baseURL: 'https://api.ultralisk.com/v1',\n  apiKey: 'your-api-key',\n});\n\nconst response = await client.chat.completions.create({\n  model: '${model}',\n  messages: [\n${msgsStr}\n  ],\n  temperature: ${params.temperature ?? 0.7},\n  max_tokens: ${params.max_tokens ?? 512},\n});\nconsole.log(response.choices[0].message.content);`;
}

const GENERATORS: Record<string, typeof generateCurl> = { curl: generateCurl, python: generatePython, typescript: generateTypeScript };

export function ApiViewModal({ opened, onClose, model, messages, params }: Props) {
  const [tab, setTab] = useState('python');
  const generator = GENERATORS[tab] ?? generatePython;
  const filteredMessages = messages.filter((m) => m.role !== 'system');
  const code = generator(model, filteredMessages, params);

  return (
    <Modal opened={opened} onClose={onClose} title="API Request Preview" size="xl" centered>
      <Group justify="flex-end" mb="sm">
        <SegmentedControl size="xs" value={tab} data={[{ label: 'Python', value: 'python' }, { label: 'TypeScript', value: 'typescript' }, { label: 'curl', value: 'curl' }]} onChange={setTab as (v: string) => void} />
      </Group>
      <Paper withBorder p="sm" style={{ position: 'relative', backgroundColor: 'var(--mantine-color-dark-8)' }}>
        <CopyButton value={code} timeout={2000}>{({ copied, copy }) => (<ActionIcon color={copied ? 'teal' : 'gray'} variant="subtle" onClick={copy} style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}>{copied ? <IconCheck size={16} /> : <IconCopy size={16} />}</ActionIcon>)}</CopyButton>
        <Code block style={{ background: 'transparent', whiteSpace: 'pre-wrap' }}>{code}</Code>
      </Paper>
    </Modal>
  );
}
