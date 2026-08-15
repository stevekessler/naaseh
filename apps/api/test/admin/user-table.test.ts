import { describe, expect, it } from 'vitest';
import { createUserAdminService } from '../../src/admin/user-admin-service.js';

const users = [
  {
    id: 'admin-a',
    username: 'alpha',
    displayName: 'Alpha',
    role: 'admin' as const,
    active: true,
    sessionEpoch: 1,
    version: 3,
    tfaStatus: 'enabled' as const,
  },
  {
    id: 'user-z',
    username: 'zulu',
    displayName: 'Zulu',
    role: 'user' as const,
    active: true,
    sessionEpoch: 1,
    version: 2,
    tfaStatus: 'disabled' as const,
  },
];

describe('administrator user table service', () => {
  it('orders stable pages, caps limits, and rejects stale action versions', async () => {
    const service = createUserAdminService({
      list: async () => [...users].reverse(),
      get: async (id) => users.find((user) => user.id === id),
      setStatus: async (id, active, _epoch, version) => ({
        ...users.find((user) => user.id === id)!,
        active,
        version: (version ?? 1) + 1,
      }),
    });
    const page = await service.pageUsers({ limit: 500 });
    expect(page.items.map(({ id }) => id)).toEqual(['admin-a', 'user-z']);
    await expect(service.setUserActive('admin-a', 'user-z', false, 1)).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(service.setUserActive('admin-a', 'admin-a', false, 3)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
