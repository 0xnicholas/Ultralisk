import { useState, useRef, useEffect } from 'react';
import { Textarea, ActionIcon, Group, Text, Image, CloseButton } from '@mantine/core';
import { IconArrowUp, IconPaperclip } from '@tabler/icons-react';

interface Props { onSend: (content: string, images?: string[]) => void; disabled: boolean; multiModal: boolean; maxTokens: number; }

export function ChatInput({ onSend, disabled, multiModal, maxTokens }: Props) {
  const [value, setValue] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { textareaRef.current?.focus(); }, [disabled]);
  const estimatedTokens = Math.ceil(value.length / 4); const isOverLimit = estimatedTokens > maxTokens;

  const handleSend = () => {
    const trimmed = value.trim();
    if ((!trimmed && images.length === 0) || disabled) return;
    onSend(trimmed, images.length > 0 ? images : undefined);
    setValue('');
    setImages([]);
  };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) setImages((prev) => [...prev, ev.target!.result as string]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div style={{ padding: 'var(--mantine-spacing-md)', borderTop: '1px solid var(--mantine-color-default-border)' }}>
      {images.length > 0 && (
        <Group gap="xs" mb="xs">
          {images.map((img, idx) => (
            <div key={idx} style={{ position: 'relative', display: 'inline-block' }}>
              <Image src={img} alt={`Upload ${idx}`} width={80} height={80} style={{ objectFit: 'cover', borderRadius: 8 }} />
              <CloseButton size="xs" style={{ position: 'absolute', top: -6, right: -6 }} onClick={() => removeImage(idx)} />
            </div>
          ))}
        </Group>
      )}
      <Group align="flex-end" gap="xs">
        {multiModal && (
          <>
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" multiple onChange={handleFileSelect} />
            <ActionIcon variant="light" size="lg" disabled={disabled} onClick={() => fileInputRef.current?.click()}>
              <IconPaperclip size={18} />
            </ActionIcon>
          </>
        )}
        <Textarea ref={textareaRef} value={value} onChange={(e) => setValue(e.currentTarget.value)} onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send, Shift+Enter for new line)" minRows={1} maxRows={6} autosize disabled={disabled} style={{ flex: 1 }} />
        <ActionIcon variant="filled" size="lg" color="violet" onClick={handleSend} disabled={disabled || (!value.trim() && images.length === 0)}><IconArrowUp size={18} /></ActionIcon>
      </Group>
      {value && <Text size="xs" c={isOverLimit ? 'red' : 'dimmed'} mt={4}>~{estimatedTokens} tokens{isOverLimit && ` — exceeds model limit by ${estimatedTokens - maxTokens} tokens`}</Text>}
    </div>
  );
}
