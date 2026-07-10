export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: 'admin' | 'developer' | 'readonly';
  org_id: string;
  org_name: string;
  created_at: string;
}

export interface SingleResponse<T> {
  data: T;
}
