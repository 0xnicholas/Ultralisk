# Task for worker

You are implementing Task 7: Playground — Core Chat & Streaming

Work from: /Users/nicholasl/Documents/build-whatever/Ultralisk

Tasks 1-6 done. Create the Playground page with chat streaming, multi-session management, and settings panel. All code below — create each file exactly as specified.

## Step 1: Create storage helpers

Create `packages/console-ui/src/utils/storage.ts`:
```typescript
import type { PlaygroundSession } from '@/types';

const SESSIONS_KEY = 'ultralisk_playground_sessions';

export function getSessions(): PlaygroundSession[] {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? '[]'); } catch { return []; }
}

export function saveSessions(sessions: PlaygroundSession[]): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function getSession(id: string): PlaygroundSession | undefined {
  return getSessions().find((s) => s.id === id);
}

export function saveSession(session: PlaygroundSession): void {
  const sessions = getSessions().filter((s) => s.id !== session.id);
  sessions.push(session);
  saveSessions(sessions);
}

export function deleteSession(id: string): void {
  saveSessions(getSessions().filter((s) => s.id !== id));
}
```

## Step 2: Create chat API with SSE streaming

Create `packages/console-ui/src/api/chat.ts`:
```typescript
import type { ChatMessage } from '@/types';

export function streamChat(
  model: string, messages: ChatMessage[], params: Record<string, unknown>,
  onToken: (token: string) => void, onDone: () => void, onError: (err: Error) => void,
): AbortController {
  const controller = new AbortController();
  fetch('/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true, ...params }),
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error?.message ?? `HTTP ${res.status}`); }
    const reader = res.body?.getReader(); if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder(); let buffer = '';
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6); if (data === '[DONE]') { onDone(); return; }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onToken(content);
          if (parsed.choices?.[0]?.finish_reason) onDone();
        } catch { /* skip */ }
      }
    }
    onDone();
  }).catch((err) => { if (err.name !== 'AbortError') onError(err); });
  return controller;
}
```

## Step 3: Create usePlaygroundSession hook

Create `packages/console-ui/src/hooks/usePlaygroundSession.ts`:
```typescript
import { useState, useCallback } from 'react';
import type { PlaygroundSession, ChatMessage } from '@/types';
import { getSessions, saveSession, deleteSession } from '@/utils/storage';

function generateId(): string { return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

export function usePlaygroundSession(initialModelId = 'llama-3.1-8b-instruct') {
  const [sessions, setSessions] = useState<PlaygroundSession[]>(getSessions);
  const [activeId, setActiveId] = useState<string>(() => { const first = getSessions()[0]; return first?.id ?? ''; });
  const activeSession = sessions.find((s) => s.id === activeId);

  const createSession = useCallback((modelId = initialModelId) => {
    const session: PlaygroundSession = { id: generateId(), name: 'New Chat', modelId, messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setSessions((prev) => [...prev, session]); setActiveId(session.id); saveSession(session); return session;
  }, [initialModelId]);

  const addMessage = useCallback((sessionId: string, msg: ChatMessage) => {
    setSessions((prev) => prev.map((s) => { if (s.id !== sessionId) return s; const updated = { ...s, messages: [...s.messages, msg], updatedAt: new Date().toISOString() }; saveSession(updated); return updated; }));
  }, []);

  const updateLastAssistant = useCallback((sessionId: string, content: string) => {
    setSessions((prev) => prev.map((s) => { if (s.id !== sessionId) return s; const msgs = [...s.messages];
      if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content };
      else msgs.push({ role: 'assistant', content }); const updated = { ...s, messages: msgs, updatedAt: new Date().toISOString() }; saveSession(updated); return updated; }));
  }, []);

  const renameSession = useCallback((sessionId: string, name: string) => {
    setSessions((prev) => prev.map((s) => { if (s.id !== sessionId) return s; const updated = { ...s, name }; saveSession(updated); return updated; }));
  }, []);

  const removeSession = useCallback((sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId)); deleteSession(sessionId);
    if (sessionId === activeId) setActiveId((prev) => { const remaining = getSessions(); return remaining.length > 0 ? remaining[0].id : ''; });
  }, [activeId]);

  const changeModel = useCallback((sessionId: string, modelId: string) => {
    setSessions((prev) => prev.map((s) => { if (s.id !== sessionId) return s; const updated = { ...s, modelId }; saveSession(updated); return updated; }));
  }, []);

  return { sessions, activeId, activeSession, setActiveId, createSession, addMessage, updateLastAssistant, renameSession, removeSession, changeModel };
}
```

## Step 4: Create usePlaygroundChat hook

Create `packages/console-ui/src/hooks/usePlaygroundChat.ts`:
```typescript
import { useState, useCallback, useRef } from 'react';
import { streamChat } from '@/api/chat';

export function usePlaygroundChat() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback((model: string, messages: { role: string; content: string }[], params: Record<string, unknown>, onToken: (token: string) => void, onDone: () => void, onError: (err: string) => void) => {
    setIsStreaming(true); setError(null); setErrorType(null); setRetryAfter(null);
    abortRef.current = streamChat(model, messages, params, onToken, () => { setIsStreaming(false); onDone(); },
      (err) => { setIsStreaming(false); const msg = err.message; setError(msg);
        if (msg.includes('429') || msg.includes('rate')) { setErrorType('rate_limit'); setRetryAfter(15); }
        else if (msg.includes('timeout') || msg.includes('abort')) setErrorType('timeout');
        else setErrorType('general');
        onError(msg);
      });
  }, []);

  const cancel = useCallback(() => { abortRef.current?.abort(); setIsStreaming(false); }, []);
  return { send, cancel, isStreaming, error, errorType, retryAfter };
}
```

## Step 5: Create ModelSelector

Create `packages/console-ui/src/components/playground/ModelSelector.tsx`:
```typescript
import { Select, Badge, Group, Text } from '@mantine/core';
import { useModels } from '@/hooks/useModels';
import type { Model } from '@/types';

interface Props { value: string; onChange: (modelId: string) => void; }

export function ModelSelector({ value, onChange }: Props) {
  const { data: models } = useModels();
  const options = (models ?? []).map((m: Model) => ({ value: m.id, label: m.display_name, disabled: m.status !== 'available' }));
  const selectedModel = models?.find((m) => m.id === value);
  return (
    <Group gap="xs">
      <Select data={options} value={value} onChange={(v) => v && onChange(v)} searchable placeholder="Select a model" style={{ minWidth: 280 }}
        renderOption={({ option }) => (<Group><Text size="sm">{option.label}</Text>{option.disabled && <Badge size="xs" color="red" variant="light">Unavailable</Badge>}</Group>)} />
      {selectedModel && selectedModel.status !== 'available' && <Badge color="red" variant="light">{selectedModel.status === 'degraded' ? 'Degraded — try another model' : 'Unavailable'}</Badge>}
    </Group>
  );
}
```

## Step 6: Create MessageBubble (install react-markdown first!)

Run: `cd packages/console-ui && pnpm add react-markdown`

Then create `packages/console-ui/src/components/playground/MessageBubble.tsx`:
```typescript
import { Paper, Text, Group, ActionIcon, CopyButton, Tooltip } from '@mantine/core';
import { IconCopy, IconCheck, IconEdit, IconRefresh } from '@tabler/icons-react';
import ReactMarkdown from 'react-markdown';

interface Props { role: 'user' | 'assistant' | 'system'; content: string; onEdit?: () => void; onRegenerate?: () => void; }

export function MessageBubble({ role, content, onEdit, onRegenerate }: Props) {
  const isUser = role === 'user'; const isSystem = role === 'system';
  return (
    <Paper withBorder={!isSystem} p={isSystem ? 'xs' : 'md'} radius="md"
      bg={isUser ? 'var(--mantine-color-violet-light)' : isSystem ? 'var(--mantine-color-gray-light)' : undefined}
      mb="sm" style={{ maxWidth: '85%', marginLeft: isUser ? 'auto' : 0 }}>
      {isSystem && <Text size="xs" fw={700} c="dimmed" mb={4}>SYSTEM PROMPT</Text>}
      {role === 'assistant' ? <div style={{ fontSize: 'var(--mantine-font-size-sm)' }}><ReactMarkdown>{content}</ReactMarkdown></div> : <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{content}</Text>}
      <Group gap={4} mt={4} justify="flex-end">
        <CopyButton value={content} timeout={2000}>{({ copied, copy }) => (<Tooltip label={copied ? 'Copied' : 'Copy'}><ActionIcon variant="subtle" size="xs" color="gray" onClick={copy}>{copied ? <IconCheck size={12} /> : <IconCopy size={12} />}</ActionIcon></Tooltip>)}</CopyButton>
        {isUser && onEdit && <Tooltip label="Edit"><ActionIcon variant="subtle" size="xs" color="gray" onClick={onEdit}><IconEdit size={12} /></ActionIcon></Tooltip>}
        {role === 'assistant' && onRegenerate && <Tooltip label="Regenerate"><ActionIcon variant="subtle" size="xs" color="gray" onClick={onRegenerate}><IconRefresh size={12} /></ActionIcon></Tooltip>}
      </Group>
    </Paper>
  );
}
```

## Step 7: Create ChatArea

Create `packages/console-ui/src/components/playground/ChatArea.tsx`:
```typescript
import { useRef, useEffect } from 'react';
import { ScrollArea, Text, Alert } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from '@/types';

interface Props {
  systemPrompt: string; messages: ChatMessage[]; isStreaming: boolean; streamingContent: string;
  error: string | null; errorType: string | null; retryAfter: number | null;
  onEditMessage: (index: number) => void; onRegenerate: () => void; onRetry: () => void;
}

export function ChatArea({ systemPrompt, messages, isStreaming, streamingContent, error, errorType, retryAfter, onEditMessage, onRegenerate, onRetry }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => { viewport.current?.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' }); }, [messages, streamingContent]);

  return (
    <ScrollArea viewportRef={viewport} h="100%" offsetScrollbars>
      <div style={{ padding: 'var(--mantine-spacing-md)' }}>
        {systemPrompt && <MessageBubble role="system" content={systemPrompt} />}
        {messages.map((msg, i) => (<MessageBubble key={i} role={msg.role} content={msg.content} onEdit={msg.role === 'user' ? () => onEditMessage(i) : undefined} onRegenerate={msg.role === 'assistant' ? () => onRegenerate() : undefined} />))}
        {isStreaming && streamingContent && <MessageBubble role="assistant" content={streamingContent} />}
        {isStreaming && !streamingContent && <Text size="sm" c="dimmed" fs="italic">Generating...</Text>}
        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light" title={errorType === 'rate_limit' ? 'Rate Limited' : errorType === 'timeout' ? 'Connection Lost' : 'Error'}>
            <Text size="sm">{error}{retryAfter && ` — Retry in ${retryAfter}s`}</Text>
            {onRetry && <Text size="sm" c="violet" style={{ cursor: 'pointer', marginTop: 4 }} onClick={onRetry}>Retry</Text>}
          </Alert>
        )}
      </div>
    </ScrollArea>
  );
}
```

## Step 8: Create ChatInput

Create `packages/console-ui/src/components/playground/ChatInput.tsx`:
```typescript
import { useState, useRef, useEffect } from 'react';
import { Textarea, ActionIcon, Group, Text } from '@mantine/core';
import { IconArrowUp, IconPaperclip } from '@tabler/icons-react';

interface Props { onSend: (content: string) => void; disabled: boolean; multiModal: boolean; maxTokens: number; }

export function ChatInput({ onSend, disabled, multiModal, maxTokens }: Props) {
  const [value, setValue] = useState(''); const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { textareaRef.current?.focus(); }, [disabled]);
  const estimatedTokens = Math.ceil(value.length / 4); const isOverLimit = estimatedTokens > maxTokens;

  const handleSend = () => { const trimmed = value.trim(); if (!trimmed || disabled) return; onSend(trimmed); setValue(''); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };

  return (
    <div style={{ padding: 'var(--mantine-spacing-md)', borderTop: '1px solid var(--mantine-color-default-border)' }}>
      <Group align="flex-end" gap="xs">
        {multiModal && <ActionIcon variant="light" size="lg" disabled={disabled}><IconPaperclip size={18} /></ActionIcon>}
        <Textarea ref={textareaRef} value={value} onChange={(e) => setValue(e.currentTarget.value)} onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send, Shift+Enter for new line)" minRows={1} maxRows={6} autosize disabled={disabled} style={{ flex: 1 }} />
        <ActionIcon variant="filled" size="lg" color="violet" onClick={handleSend} disabled={disabled || !value.trim()}><IconArrowUp size={18} /></ActionIcon>
      </Group>
      {value && <Text size="xs" c={isOverLimit ? 'red' : 'dimmed'} mt={4}>~{estimatedTokens} tokens{isOverLimit && ` — exceeds model limit by ${estimatedTokens - maxTokens} tokens`}</Text>}
    </div>
  );
}
```

## Step 9: Create SettingsPanel

Create `packages/console-ui/src/components/playground/SettingsPanel.tsx`:
```typescript
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
```

## Step 10: Create SessionTabs

Create `packages/console-ui/src/components/playground/SessionTabs.tsx`:
```typescript
import { Tabs, ActionIcon, TextInput, Group } from '@mantine/core';
import { IconPlus, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import type { PlaygroundSession } from '@/types';

interface Props { sessions: PlaygroundSession[]; activeId: string; onSelect: (id: string) => void; onCreate: () => void; onRename: (id: string, name: string) => void; onDelete: (id: string) => void; }

export function SessionTabs({ sessions, activeId, onSelect, onCreate, onRename, onDelete }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null); const [editValue, setEditValue] = useState('');

  return (
    <Tabs value={activeId} onChange={(v) => v && onSelect(v)} variant="outline">
      <Group gap={0} wrap="nowrap">
        <Tabs.List style={{ flex: 1, overflow: 'auto' }}>
          {sessions.map((s) => (
            <Tabs.Tab key={s.id} value={s.id} onDoubleClick={() => { setEditingId(s.id); setEditValue(s.name); }}
              rightSection={sessions.length > 1 ? <ActionIcon size="xs" variant="subtle" color="gray" onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}><IconX size={12} /></ActionIcon> : undefined}>
              {editingId === s.id ? <TextInput size="xs" value={editValue} onChange={(e) => setEditValue(e.currentTarget.value)} onBlur={() => { onRename(s.id, editValue || s.name); setEditingId(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { onRename(s.id, editValue || s.name); setEditingId(null); } }} autoFocus onClick={(e) => e.stopPropagation()} style={{ minWidth: 80 }} /> : s.name}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <ActionIcon variant="subtle" onClick={onCreate} ml={4}><IconPlus size={16} /></ActionIcon>
      </Group>
    </Tabs>
  );
}
```

## Step 11: Create PlaygroundPage

Create `packages/console-ui/src/pages/playground/PlaygroundPage.tsx`:
```typescript
import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Group, Title } from '@mantine/core';
import { ModelSelector } from '@/components/playground/ModelSelector';
import { ChatArea } from '@/components/playground/ChatArea';
import { ChatInput } from '@/components/playground/ChatInput';
import { SettingsPanel } from '@/components/playground/SettingsPanel';
import { SessionTabs } from '@/components/playground/SessionTabs';
import { usePlaygroundSession } from '@/hooks/usePlaygroundSession';
import { usePlaygroundChat } from '@/hooks/usePlaygroundChat';
import { useModels } from '@/hooks/useModels';

export function PlaygroundPage() {
  const [searchParams] = useSearchParams(); const urlModelId = searchParams.get('model');
  const { sessions, activeId, activeSession, setActiveId, createSession, addMessage, updateLastAssistant, renameSession, removeSession, changeModel } = usePlaygroundSession(urlModelId ?? 'llama-3.1-8b-instruct');
  const { send, cancel, isStreaming, error, errorType, retryAfter } = usePlaygroundChat();
  const { data: models } = useModels();
  const [streamingContent, setStreamingContent] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');

  if (!activeSession && sessions.length === 0) { createSession(urlModelId); }

  const currentModel = models?.find((m) => m.id === activeSession?.modelId);
  const contextWindow = currentModel?.capabilities.context_window ?? 131072;

  const [params, setParams] = useState({ max_tokens: 512, temperature: 0.7, top_p: 1.0, stop: [] as string[], frequency_penalty: 0, presence_penalty: 0, response_format: 'text' as 'text' | 'json_object' });

  const handleSend = useCallback((content: string) => {
    if (!activeId) return;
    const userMsg = { role: 'user' as const, content }; addMessage(activeId, userMsg); setStreamingContent('');
    const allMessages = [...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []), ...(activeSession?.messages ?? []), userMsg];
    send(activeSession?.modelId ?? 'llama-3.1-8b-instruct', allMessages, params, (token) => setStreamingContent((prev) => prev + token),
      () => { setStreamingContent((prev) => { if (prev && activeId) updateLastAssistant(activeId, prev); return ''; }); }, (_err) => {});
  }, [activeId, activeSession, systemPrompt, params, addMessage, send, updateLastAssistant]);

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px - var(--mantine-spacing-md) * 2)' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Group px="md" pt="md" pb="xs" justify="space-between">
          <Group><Title order={4}>Playground</Title><ModelSelector value={activeSession?.modelId ?? ''} onChange={(id) => activeId && changeModel(activeId, id)} /></Group>
        </Group>
        <SessionTabs sessions={sessions} activeId={activeId} onSelect={setActiveId} onCreate={() => createSession()} onRename={renameSession} onDelete={removeSession} />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ChatArea systemPrompt={systemPrompt} messages={activeSession?.messages ?? []} isStreaming={isStreaming} streamingContent={streamingContent}
            error={error} errorType={errorType} retryAfter={retryAfter} onEditMessage={() => {}} onRegenerate={() => {}} onRetry={() => {}} />
        </div>
        <ChatInput onSend={handleSend} disabled={isStreaming || !activeSession} multiModal={currentModel?.capabilities.multi_modal ?? false} maxTokens={contextWindow} />
      </div>
      <SettingsPanel params={params} onChange={setParams} systemPrompt={systemPrompt} onSystemPromptChange={setSystemPrompt} />
    </div>
  );
}
```

## Step 12: Add Playground routes to App.tsx AND add react-markdown dep

Run: `cd packages/console-ui && pnpm add react-markdown`

Then edit `packages/console-ui/src/App.tsx` — add import:
```typescript
import { PlaygroundPage } from '@/pages/playground/PlaygroundPage';
```
Add routes inside ConsoleLayout:
```typescript
<Route path="/playground" element={<PlaygroundPage />} />
<Route path="/playground/:sessionId" element={<PlaygroundPage />} />
```

## Step 13: Verify typecheck and commit

```bash
cd packages/console-ui && pnpm typecheck
```
Fix any errors.

```bash
git add packages/console-ui/src packages/console-ui/package.json pnpm-lock.yaml
git commit -m "feat: add Playground with chat streaming, session management, and settings panel"
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