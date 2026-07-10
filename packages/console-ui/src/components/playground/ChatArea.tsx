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
