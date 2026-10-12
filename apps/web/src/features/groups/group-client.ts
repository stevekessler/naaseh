import type { GroupMembershipView, GroupView } from '@naaseh/domain';
import { removeLocalGroup, saveLocalGroup, saveLocalGroups } from '../../db/group-repository.js';

async function request<T>(path: string, csrfToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.method && init.method !== 'GET' ? { 'x-csrf-token': csrfToken } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const retryable = response.status === 429;
    throw new Error(retryable ? 'Too many attempts. Try again later.' : 'Unable to update group.');
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function refreshGroups(csrfToken: string) {
  const result = await request<{ items: GroupView[] }>('/groups', csrfToken);
  await saveLocalGroups(result.items);
  return result.items;
}

export async function createRemoteGroup(name: string, pin: string | undefined, csrfToken: string) {
  const group = await request<GroupView>('/groups', csrfToken, {
    method: 'POST',
    body: JSON.stringify({ name, ...(pin ? { joinPin: pin } : {}) }),
  });
  await saveLocalGroup(group);
  return group;
}

export async function renameRemoteGroup(group: GroupView, name: string, csrfToken: string) {
  const updated = await request<GroupView>(`/groups/${encodeURIComponent(group.id)}`, csrfToken, {
    method: 'PATCH',
    headers: { 'if-match': String(group.version) },
    body: JSON.stringify({ name }),
  });
  await saveLocalGroup(updated);
  return updated;
}

export async function joinRemoteGroup(
  group: GroupView,
  pin: string | undefined,
  csrfToken: string,
) {
  const membership = await request<GroupMembershipView>(
    `/groups/${encodeURIComponent(group.id)}/join`,
    csrfToken,
    {
      method: 'POST',
      body: JSON.stringify({ ...(pin ? { pin } : {}) }),
    },
  );
  const joined: GroupView = { ...group, joined: true, role: membership.role };
  await saveLocalGroup(joined);
  return joined;
}

export const readRemoteGroup = (group: GroupView, csrfToken: string) =>
  request<{ group: GroupView; members: GroupMembershipView[] }>(
    `/groups/${encodeURIComponent(group.id)}`,
    csrfToken,
    { cache: 'no-store' },
  );

export const addRemoteGroupMember = (group: GroupView, userId: string, csrfToken: string) =>
  request<GroupMembershipView>(`/groups/${encodeURIComponent(group.id)}/members`, csrfToken, {
    method: 'POST',
    body: JSON.stringify({ userId, role: 'member' }),
  });

export const removeRemoteGroupMember = (group: GroupView, userId: string, csrfToken: string) =>
  request<void>(
    `/groups/${encodeURIComponent(group.id)}/members/${encodeURIComponent(userId)}`,
    csrfToken,
    { method: 'DELETE' },
  );

export async function deleteRemoteGroup(group: GroupView, csrfToken: string) {
  await request<void>(`/groups/${encodeURIComponent(group.id)}`, csrfToken, {
    method: 'DELETE',
  });
  await removeLocalGroup(group.id);
}
