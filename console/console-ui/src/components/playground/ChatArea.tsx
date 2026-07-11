import { useRef, useEffect } from 'react';
import { ScrollArea, Text, Alert, Paper, Textarea, Button, Group } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from '@/types';

interface Props {
  systemPrompt: string; messages: ChatMessage[]; isStreaming: boolean; streamingContent: string;
  error: string | null; errorType: string | null; retryAfter: number | null;
  onEditMessage: (index: number) => void; onRegenerate: () => void; onRetry: () => void;
  editingIndex: number | null; editingContent: string;
  onSaveEdit: () => void; onCancelEdit: () => void; onSetEditingContent: (content: string) => void;
}

export function ChatArea({ systemPrompt, messages, isStreaming, streamingContent, error, errorType, retryAfter, onEditMessage, onRegenerate, onRetry, editingIndex, editingContent, onSaveEdit, onCancelEdit, onSetEditingContent }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => { viewport.current?.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' }); }, [messages, streamingContent]);

  return (
    <ScrollArea viewportRef={viewport} h="100%" offsetScrollbars>
      <div style={{ padding: 'var(--mantine-spacing-md)' }}>
        {systemPrompt && <MessageBubble role="system" content={systemPrompt} />}
        {messages.map((msg, i) => editingIndex === i ? (
          <Paper withBorder p="md" radius="md" mb="sm" key={i}>
            <Textarea value={editingContent} onChange={(e) => onSetEditingContent(e.currentTarget.value)} minRows={3} autosize mb="xs" />
            <Group justify="flex-end" gap="xs">
              <Button size="xs" variant="default" onClick={onCancelEdit}>Cancel</Button>
              <Button size="xs" onClick={onSaveEdit}>Save</Button>
            </Group>
          </Paper>
        ) : (
          <MessageBubble key={i} role={msg.role} content={msg.content} onEdit={msg.role === 'user' ? () => onEditMessage(i) : undefined} onRegenerate={msg.role === 'assistant' ? () => onRegenerate() : undefined} />
        ))}
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
