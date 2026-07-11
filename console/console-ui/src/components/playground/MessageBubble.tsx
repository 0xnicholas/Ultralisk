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
