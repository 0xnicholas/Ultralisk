import type { PlaygroundSession } from '@/types';

const SESSIONS_KEY = 'ultralisk_playground_sessions';

export function getSessions(): PlaygroundSession[] {
  try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? '[]'); } catch { return []; }
}

export function saveSessions(sessions: PlaygroundSession[]): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function getSession(id: string): PlaygroundSession | undefined {
  return getSessions().find((s) => s.id === id);
}

export function saveSession(session: PlaygroundSession): void {
  const sessions = getSessions().filter((s) => s.id !== session.id);
  sessions.push(session);
  saveSessions(sessions);
}

export function deleteSession(id: string): void {
  saveSessions(getSessions().filter((s) => s.id !== id));
}
