import { apiFetch } from './client';
import type { User, SingleResponse } from '@/types';

// Minimal stub — Task 3 will flesh this out

export async function login(email: string, password: string) {
  return apiFetch<SingleResponse<{ user: User; jwt: string }>>('/v1/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function acceptInvitation(token: string, password: string) {
  return apiFetch<SingleResponse<{ user: User; jwt: string }>>('/v1/admin/auth/accept-invitation', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

export async function getMe() {
  return apiFetch<SingleResponse<User>>('/v1/admin/auth/me');
}
