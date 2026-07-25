import type { AdminUser } from './UsersAdminPage.js';
import type { CategoryRecord, Project } from '@naaseh/domain';

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

export const listAdminProjects = (csrfToken: string) =>
  adminRequest<Project[]>('/projects', csrfToken);
export const createAdminProject = (
  input: { categoryId: string; name: string; endDate?: string },
  csrfToken: string,
) => adminRequest<Project>('/projects', csrfToken, { method: 'POST', body: JSON.stringify(input) });
export const updateAdminProject = (project: Project, patch: Partial<Project>, csrfToken: string) =>
  adminRequest<Project>(`/projects/${encodeURIComponent(project.id)}`, csrfToken, {
    method: 'PATCH',
    headers: { 'if-match': String(project.version) },
    body: JSON.stringify(patch),
  });
export const createAdminCategory = (
  input: Pick<CategoryRecord, 'name' | 'color'>,
  csrfToken: string,
) =>
  adminRequest<CategoryRecord>('/categories', csrfToken, {
    method: 'POST',
    body: JSON.stringify(input),
  });
export const updateAdminCategory = (
  category: CategoryRecord,
  patch: Partial<CategoryRecord>,
  csrfToken: string,
) =>
  adminRequest<CategoryRecord>(`/categories/${encodeURIComponent(category.id)}`, csrfToken, {
    method: 'PATCH',
    headers: { 'if-match': String(category.version) },
    body: JSON.stringify(patch),
  });
