import type { GroupMembershipView, GroupView } from '@naaseh/domain';
import { saveLocalGroup, saveLocalGroups } from '../../db/group-repository.js';

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
