import { apiFetch } from './client';
import type { User, SingleResponse } from '@/types';

export interface LoginResponse {
  user: User;
  jwt: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  totp_required: boolean;
  session_token: string | null;
}

export async function login(email: string, password: string) {
  return apiFetch<SingleResponse<LoginResponse>>('/v1/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    skipAuthExpired: true, // login returning 401 must NOT clear existing auth
  });
}

export async function acceptInvitation(token: string, password: string) {
  return apiFetch<SingleResponse<LoginResponse>>('/v1/admin/auth/accept-invitation', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
    skipAuthExpired: true,
  });
}

export async function getMe() {
  return apiFetch<SingleResponse<User>>('/v1/admin/auth/me', {
    skipAuthExpired: true, // /auth/me is a probe; let the page handle 401 by showing /login itself
  });
}