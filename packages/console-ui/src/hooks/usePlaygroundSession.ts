import { useState, useCallback } from 'react';
import type { PlaygroundSession, ChatMessage } from '@/types';
import { getSessions, saveSession, deleteSession } from '@/utils/storage';

function generateId(): string { return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

export function usePlaygroundSession(initialModelId = 'llama-3.1-8b-instruct') {
  const [sessions, setSessions] = useState<PlaygroundSession[]>(getSessions);
  const [activeId, setActiveId] = useState<string>(() => { const first = getSessions()[0]; return first?.id ?? ''; });
  const activeSession = sessions.find((s) => s.id === activeId);

  const createSession = useCallback((modelId = initialModelId) => {
    const session: PlaygroundSession = { id: generateId(), name: 'New Chat', modelId, messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setSessions((prev) => [...prev, session]); setActiveId(session.id); saveSession(session); return session;
  }, [initialModelId]);

  const addMessage = useCallback((sessionId: string, msg: ChatMessage) => {
    setSessions((prev) => prev.map((s) => { if (s.id !== sessionId) return s; const updated = { ...s, messages: [...s.messages, msg], updatedAt: new Date().toISOString() }; saveSession(updated); return updated; }));
  }, []);

  const updateLastAssistant = useCallback((sessionId: string, content: string) => {
    setSessions((prev) => prev.map((s) => { if (s.id !== sessionId) return s; const msgs = [...s.messages];
      if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content };
      else msgs.push({ role: 'assistant', content }); const updated = { ...s, messages: msgs, updatedAt: new Date().toISOString() }; saveSession(updated); return updated; }));
  }, []);

  const renameSession = useCallback((sessionId: string, name: string) => {
    setSessions((prev) => prev.map((s) => { if (s.id !== sessionId) return s; const updated = { ...s, name }; saveSession(updated); return updated; }));
  }, []);

  const removeSession = useCallback((sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId)); deleteSession(sessionId);
    if (sessionId === activeId) setActiveId((prev) => { const remaining = getSessions(); return remaining.length > 0 ? remaining[0].id : ''; });
  }, [activeId]);

  const changeModel = useCallback((sessionId: string, modelId: string) => {
    setSessions((prev) => prev.map((s) => { if (s.id !== sessionId) return s; const updated = { ...s, modelId }; saveSession(updated); return updated; }));
  }, []);

  return { sessions, activeId, activeSession, setActiveId, createSession, addMessage, updateLastAssistant, renameSession, removeSession, changeModel };
}
