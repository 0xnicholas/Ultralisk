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
