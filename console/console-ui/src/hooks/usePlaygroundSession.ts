import { useState, useCallback, useEffect } from 'react';
import type { PlaygroundSession, ChatMessage } from '@/types';
import { getSessions, saveSession, deleteSession, saveSessions } from '@/utils/storage';
import { useAuth } from '@/stores/useAuth';
import { createSession as apiCreateSession, updateSession as apiUpdateSession, deleteSession as apiDeleteSession, getSessions as fetchBackendSessions } from '@/api/sessions';

function generateId(): string { return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

export function usePlaygroundSession(initialModelId = 'llama-3.1-8b-instruct') {
  const [sessions, setSessions] = useState<PlaygroundSession[]>(getSessions);
  const [activeId, setActiveId] = useState<string>(() => { const first = getSessions()[0]; return first?.id ?? ''; });
  const activeSession = sessions.find((s) => s.id === activeId);
  const { user } = useAuth();

  // Merge with backend on mount (when user is logged in)
  useEffect(() => {
    if (!user) return;
    fetchBackendSessions().then((res) => {
      const backend = res.data.map((s: any) => ({
        id: s.id, name: s.name, modelId: s.model_id,
        messages: s.messages.map((m: any) => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })),
        createdAt: s.created_at, updatedAt: s.updated_at,
      }));
      const localSessions = getSessions();
      const merged = [...backend];
      for (const ls of localSessions) {
        if (!merged.find((b: any) => b.id === ls.id)) merged.push(ls);
      }
      merged.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setSessions(merged);
      saveSessions(merged);
    }).catch(() => {});
  }, [user]);

  const createSession = useCallback((modelId = initialModelId) => {
    const session: PlaygroundSession = { id: generateId(), name: 'New Chat', modelId, messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setSessions((prev) => [...prev, session]); setActiveId(session.id); saveSession(session);
    if (user) {
      apiCreateSession({ name: session.name, model_id: session.modelId }).catch(() => {});
    }
    return session;
  }, [initialModelId, user]);

  const addMessage = useCallback((sessionId: string, msg: ChatMessage) => {
    setSessions((prev) => prev.map((s) => {
      if (s.id !== sessionId) return s;
      const updated = { ...s, messages: [...s.messages, msg], updatedAt: new Date().toISOString() };
      saveSession(updated);
      if (user) { apiUpdateSession(sessionId, { messages: updated.messages as any }).catch(() => {}); }
      return updated;
    }));
  }, [user]);

  const updateLastAssistant = useCallback((sessionId: string, content: string) => {
    setSessions((prev) => prev.map((s) => {
      if (s.id !== sessionId) return s;
      const msgs = [...s.messages];
      if (msgs.length > 0 && msgs[msgs.length - 1].role === 'assistant') {
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content };
      } else {
        msgs.push({ role: 'assistant', content });
      }
      const updated = { ...s, messages: msgs, updatedAt: new Date().toISOString() };
      saveSession(updated);
      return updated;
    }));
  }, []);

  const renameSession = useCallback((sessionId: string, name: string) => {
    setSessions((prev) => prev.map((s) => {
      if (s.id !== sessionId) return s;
      const updated = { ...s, name };
      saveSession(updated);
      return updated;
    }));
  }, []);

  const removeSession = useCallback((sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    deleteSession(sessionId);
    if (user) {
      apiDeleteSession(sessionId).catch(() => {});
    }
    if (sessionId === activeId) {
      const remaining = getSessions();
      setActiveId(remaining.length > 0 ? remaining[0].id : '');
    }
  }, [activeId, user]);

  const changeModel = useCallback((sessionId: string, modelId: string) => {
    setSessions((prev) => prev.map((s) => {
      if (s.id !== sessionId) return s;
      const updated = { ...s, modelId };
      saveSession(updated);
      return updated;
    }));
  }, []);

  return { sessions, activeId, activeSession, setActiveId, createSession, addMessage, updateLastAssistant, renameSession, removeSession, changeModel };
}
