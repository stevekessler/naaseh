import { describe, expect, it, vi } from 'vitest';
import {
  createUserAdminService,
  dynamoUserAdminRepository,
} from '../../src/admin/user-admin-service.js';
import { dynamodb } from '../../src/shared/dynamodb.js';

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
    const send = vi.spyOn(dynamodb, 'send');
    try {
      send
        .mockResolvedValueOnce({
          Items: [
            { data: { groupId: 'group-z', status: 'active' } },
            { data: { groupId: 'group-revoked', status: 'revoked' } },
            { data: { groupId: 'group-a', status: 'active' } },
            { data: { groupId: 'group-missing', status: 'active' } },
          ],
        })
        .mockResolvedValueOnce({ Item: { data: { name: 'Weekend crew' } } })
        .mockResolvedValueOnce({ Item: { data: { name: 'Family' } } })
        .mockResolvedValueOnce({});
      await expect(dynamoUserAdminRepository.groupsForUser!('admin-a')).resolves.toEqual([
        'Family',
        'Unavailable group',
        'Weekend crew',
      ]);
      expect(send).toHaveBeenCalledTimes(4);
    } finally {
      send.mockRestore();
    }
  });
});
