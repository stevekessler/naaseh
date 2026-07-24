import type { AdminUser } from './UsersAdminPage.js';

async function adminRequest<T>(path: string, csrfToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.method && init.method !== 'GET' ? { 'x-csrf-token': csrfToken } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) throw new Error('The administrative change could not be completed.');
  return (await response.json()) as T;
}

export async function listAdminUsers(csrfToken: string) {
  return (await adminRequest<{ items: AdminUser[] }>('/admin/users', csrfToken)).items;
}

export function changeAdminUserStatus(userId: string, active: boolean, csrfToken: string) {
  return adminRequest<AdminUser>(`/admin/users/${encodeURIComponent(userId)}`, csrfToken, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  });
}

export interface CreateAdminUserInput {
  username: string;
  displayName: string;
  password: string;
  pin: string;
  role: 'user' | 'admin';
}

export async function createAdminUser(input: CreateAdminUserInput, csrfToken: string) {
  const result = await adminRequest<{ user: AdminUser; created: boolean }>(
    '/admin/users',
    csrfToken,
    {
      method: 'POST',
      body: JSON.stringify({ ...input, idempotencyToken: crypto.randomUUID() }),
    },
  );
  return result.user;
}
