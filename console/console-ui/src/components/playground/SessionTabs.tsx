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
            <Tabs.Tab
              key={s.id}
              value={s.id}
              onDoubleClick={() => { setEditingId(s.id); setEditValue(s.name); }}
              rightSection={
                sessions.length > 1 ? (
                  <span
                    role="button"
                    aria-label="Delete session"
                    onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 4, cursor: 'pointer' }}
                  >
                    <IconX size={12} />
                  </span>
                ) : undefined
              }
            >
              {editingId === s.id ? (
                <TextInput
                  size="xs"
                  value={editValue}
                  onChange={(e) => setEditValue(e.currentTarget.value)}
                  onBlur={() => { onRename(s.id, editValue || s.name); setEditingId(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { onRename(s.id, editValue || s.name); setEditingId(null); } }}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  style={{ minWidth: 80 }}
                />
              ) : s.name}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <ActionIcon variant="subtle" onClick={onCreate} ml={4}><IconPlus size={16} /></ActionIcon>
      </Group>
    </Tabs>
  );
}
