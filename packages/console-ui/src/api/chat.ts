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
