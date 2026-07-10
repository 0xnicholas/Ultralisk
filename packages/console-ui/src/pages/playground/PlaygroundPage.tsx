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

  if (!activeSession && sessions.length === 0) { createSession(urlModelId ?? undefined); }

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
