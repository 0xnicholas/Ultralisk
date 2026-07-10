# Task for worker

Implement Tasks 7 (ApiViewModal), 8 (Message Editing), and 9 (Multi-Modal Upload) together

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

## TASK 7: ApiViewModal

Create `packages/console-ui/src/components/playground/ApiViewModal.tsx`:
```typescript
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
```

## Add to PlaygroundPage

Read `packages/console-ui/src/pages/playground/PlaygroundPage.tsx`.

Add imports:
```typescript
import { useState } from 'react'; // already imported
import { ActionIcon, Tooltip } from '@mantine/core'; // add Tooltip if not there
import { IconCode } from '@tabler/icons-react';
import { ApiViewModal } from '@/components/playground/ApiViewModal';
```

Add state (near other useState calls):
```typescript
const [apiViewOpen, setApiViewOpen] = useState(false);
```

Add button next to the model selector (between `<ModelSelector>` and the closing `</Group>`):
```typescript
<Tooltip label="View API code">
  <ActionIcon variant="light" onClick={() => setApiViewOpen(true)} disabled={!activeSession?.messages.length}>
    <IconCode size={18} />
  </ActionIcon>
</Tooltip>
```

Add modal before the final `</div>`:
```typescript
<ApiViewModal opened={apiViewOpen} onClose={() => setApiViewOpen(false)} model={activeSession?.modelId ?? ''} messages={activeSession?.messages ?? []} params={params} />
```

## TASK 8: Message Editing

In PlaygroundPage.tsx, add editing state:
```typescript
const [editingIndex, setEditingIndex] = useState<number | null>(null);
const [editingContent, setEditingContent] = useState('');

const handleEditMessage = (index: number) => {
  setEditingIndex(index);
  setEditingContent(activeSession?.messages[index]?.content ?? '');
};

const handleSaveEdit = () => {
  if (editingIndex === null || !activeId) return;
  addMessage(activeId, { role: 'user', content: editingContent });
  setEditingIndex(null);
};

const handleCancelEdit = () => setEditingIndex(null);

const handleRegenerate = () => {
  if (!activeId || !activeSession) return;
  const msgs = activeSession.messages;
  if (msgs.length < 2) return;
  const lastUserIdx = [...msgs].reverse().findIndex((m) => m.role === 'user');
  if (lastUserIdx === -1) return;
  const truncateAt = msgs.length - 1 - lastUserIdx;
  setStreamingContent('');
  send(activeSession.modelId, msgs.slice(0, truncateAt + 1), params,
    (token) => setStreamingContent((prev) => prev + token),
    () => { setStreamingContent((prev) => { if (prev && activeId) updateLastAssistant(activeId, prev); return ''; }); },
    () => {},
  );
};
```

Pass these to ChatArea:
```typescript
onEditMessage={handleEditMessage}
onRegenerate={handleRegenerate}
```

The ChatArea already renders editing UI if `editingIndex` matches — you'll need to add that logic to ChatArea.

Read `packages/console-ui/src/components/playground/ChatArea.tsx` and modify it. Import `Textarea` and `Button` from `@mantine/core`. Then in the messages map, add a conditional:

```typescript
{messages.map((msg, i) => editingIndex === i ? (
  <Paper withBorder p="md" radius="md" mb="sm" key={i}>
    <Textarea value={editingContent} onChange={(e) => setEditingContent(e.currentTarget.value)} minRows={3} autosize mb="xs" />
    <Group justify="flex-end" gap="xs">
      <Button size="xs" variant="default" onClick={handleCancelEdit}>Cancel</Button>
      <Button size="xs" onClick={handleSaveEdit}>Save</Button>
    </Group>
  </Paper>
) : (
  <MessageBubble ... />
))}
```

But ChatArea needs these props: `editingIndex`, `editingContent`, `handleSaveEdit`, `handleCancelEdit`, `setEditingContent`. Pass them as new props through the interface.

Actually, the simpler approach: pass `editingIndex` and `onSaveEdit`/`onCancelEdit` as props. Let me modify the ChatArea interface to add these.

## TASK 9: Multi-Modal Upload

In `PlaygroundPage.tsx`, add image state:
```typescript
const [uploadedImages, setUploadedImages] = useState<string[]>([]);
```

Modify ChatInput's onSend to handle images. In the handleSend callback:
```typescript
const handleSend = useCallback((content: string, images?: string[]) => {
  if (!activeId) return;
  const contentParts = [];
  if (content) contentParts.push({ type: 'text', text: content });
  if (images) images.forEach((img) => contentParts.push({ type: 'image_url', image_url: { url: img, detail: 'auto' as const } }));
  // ...rest of send logic
}, [...]);
```

For now, just add the image upload capability to ChatInput and preview. The actual ContentPart message format can be refined later.

Modify `ChatInput.tsx` to add:
- A hidden file input ref
- An icon button to trigger file selection  
- Image preview thumbnails
- Pass selected images to onSend

## Verify and commit

```bash
cd packages/console-ui && pnpm typecheck
# Fix any errors
git add packages/console-ui/src
git commit -m "feat: add ApiViewModal, message editing/regeneration, and multi-modal upload"
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