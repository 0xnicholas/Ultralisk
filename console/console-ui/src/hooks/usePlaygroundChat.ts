import { useState, useCallback, useRef } from 'react';
import { streamChat } from '@/api/chat';
import type { ChatMessage } from '@/types';

export function usePlaygroundChat() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback((model: string, messages: ChatMessage[], params: Record<string, unknown>, onToken: (token: string) => void, onDone: () => void, onError: (err: string) => void) => {
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
