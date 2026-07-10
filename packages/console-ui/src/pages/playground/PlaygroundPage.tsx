import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Group, Title, ActionIcon, Tooltip } from '@mantine/core';
import { IconCode } from '@tabler/icons-react';
import { ModelSelector } from '@/components/playground/ModelSelector';
import { ChatArea } from '@/components/playground/ChatArea';
import { ChatInput } from '@/components/playground/ChatInput';
import { SettingsPanel } from '@/components/playground/SettingsPanel';
import { SessionTabs } from '@/components/playground/SessionTabs';
import { usePlaygroundSession } from '@/hooks/usePlaygroundSession';
import { ApiViewModal } from '@/components/playground/ApiViewModal';
import { usePlaygroundChat } from '@/hooks/usePlaygroundChat';
import { useModels } from '@/hooks/useModels';

export function PlaygroundPage() {
  const [searchParams] = useSearchParams(); const urlModelId = searchParams.get('model');
  const { sessions, activeId, activeSession, setActiveId, createSession, addMessage, updateLastAssistant, renameSession, removeSession, changeModel } = usePlaygroundSession(urlModelId ?? 'llama-3.1-8b-instruct');
  const { send, isStreaming, error, errorType, retryAfter } = usePlaygroundChat();
  const { data: models } = useModels();
  const [streamingContent, setStreamingContent] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [apiViewOpen, setApiViewOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');

  if (!activeSession && sessions.length === 0) { createSession(urlModelId ?? undefined); }

  const currentModel = models?.find((m) => m.id === activeSession?.modelId);
  const contextWindow = currentModel?.capabilities.context_window ?? 131072;

  const [params, setParams] = useState({ max_tokens: 512, temperature: 0.7, top_p: 1.0, stop: [] as string[], frequency_penalty: 0, presence_penalty: 0, response_format: 'text' as 'text' | 'json_object' });

  const handleSend = useCallback((content: string, images?: string[]) => {
    if (!activeId) return;
    let finalContent = content;
    if (images && images.length > 0) {
      const imgMd = images.map((img) => `![image](${img})`).join('\n');
      finalContent = content ? `${content}\n\n${imgMd}` : imgMd;
    }
    const userMsg = { role: 'user' as const, content: finalContent }; addMessage(activeId, userMsg); setStreamingContent('');
    const allMessages = [...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []), ...(activeSession?.messages ?? []), userMsg];
    send(activeSession?.modelId ?? 'llama-3.1-8b-instruct', allMessages, params, (token) => setStreamingContent((prev) => prev + token),
      () => { setStreamingContent((prev) => { if (prev && activeId) updateLastAssistant(activeId, prev); return ''; }); }, (_err) => {});
  }, [activeId, activeSession, systemPrompt, params, addMessage, send, updateLastAssistant]);

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

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px - var(--mantine-spacing-md) * 2)' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Group px="md" pt="md" pb="xs" justify="space-between">
          <Group><Title order={4}>Playground</Title><ModelSelector value={activeSession?.modelId ?? ''} onChange={(id) => activeId && changeModel(activeId, id)} />
            <Tooltip label="View API code">
              <ActionIcon variant="light" onClick={() => setApiViewOpen(true)} disabled={!activeSession?.messages.length}>
                <IconCode size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
        <SessionTabs sessions={sessions} activeId={activeId} onSelect={setActiveId} onCreate={() => createSession()} onRename={renameSession} onDelete={removeSession} />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ChatArea systemPrompt={systemPrompt} messages={activeSession?.messages ?? []} isStreaming={isStreaming} streamingContent={streamingContent}
            error={error} errorType={errorType} retryAfter={retryAfter}
            onEditMessage={handleEditMessage} onRegenerate={handleRegenerate} onRetry={() => {}}
            editingIndex={editingIndex} editingContent={editingContent}
            onSaveEdit={handleSaveEdit} onCancelEdit={handleCancelEdit} onSetEditingContent={setEditingContent} />
        </div>
        <ChatInput onSend={handleSend} disabled={isStreaming || !activeSession} multiModal={currentModel?.capabilities.multi_modal ?? false} maxTokens={contextWindow} />
        <ApiViewModal opened={apiViewOpen} onClose={() => setApiViewOpen(false)} model={activeSession?.modelId ?? ''} messages={activeSession?.messages ?? []} params={params} />
      </div>
      <SettingsPanel params={params} onChange={setParams} systemPrompt={systemPrompt} onSystemPromptChange={setSystemPrompt} />
    </div>
  );
}
