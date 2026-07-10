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
