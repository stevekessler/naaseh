import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createUserAdminService,
  type UserAdminRepository,
} from '../../apps/api/src/admin/user-admin-service.js';

describe('admin API contract', () => {
  it('defines list/status and private profile-upload operations', () => {
    const contract = readFileSync('specs/001-naaseh-v1-baseline/contracts/openapi.yaml', 'utf8');
    expect(contract).toContain('operationId: listUsers');
    expect(contract).toContain('operationId: provisionUser');
    expect(contract).toContain('operationId: setUserStatus');
    expect(contract).toContain('operationId: createProfilePictureUpload');
  });

  it('returns read-only user views without credential fields', async () => {
    const repository: UserAdminRepository = {
      list: async () => [
        {
          id: 'user',
          username: 's',
          displayName: 'Steve',
          role: 'user',
          active: true,
          sessionEpoch: 0,
        },
      ],
      get: async () => undefined,
      setStatus: async () => {
        throw new Error('unused');
      },
    };
    const [view] = await createUserAdminService(repository).listUsers();
    expect(view).toEqual({
      id: 'user',
      username: 's',
      displayName: 'Steve',
      role: 'user',
      active: true,
      sessionEpoch: 0,
      version: 1,
      tfaStatus: 'disabled',
      groupSummary: [],
    });
    expect(view).not.toHaveProperty('passwordHash');
    expect(view).not.toHaveProperty('pinHash');
  });

  it('pages by stable username and ID with opaque bounded cursors and safe summaries', async () => {
    const users = Array.from({ length: 125 }, (_, index) => ({
      id: `user-${String(index).padStart(3, '0')}`,
      username: `person-${String(index).padStart(3, '0')}`,
      displayName: `Person ${index}`,
      role: index === 0 ? ('admin' as const) : ('user' as const),
      active: true,
      sessionEpoch: 0,
      version: 1,
      tfaStatus: index === 0 ? ('enabled' as const) : ('disabled' as const),
    }));
    const repository: UserAdminRepository = {
      list: async () => [...users].reverse(),
      groupsForUser: async (id) => Array.from({ length: 8 }, (_, i) => `${id}-group-${i}`),
      get: async () => undefined,
      setStatus: async () => {
        throw new Error('unused');
      },
    };
    const service = createUserAdminService(repository);
    const first = await service.pageUsers({ limit: 100 });
    expect(first.items).toHaveLength(100);
    expect(first.nextCursor).toMatch(/^[\w-]+$/u);
    expect(first.items[0]).toMatchObject({
      id: 'user-000',
      tfaStatus: 'enabled',
      groupSummary: expect.arrayContaining(['user-000-group-0']),
    });
    expect(first.items[0]!.groupSummary).toHaveLength(5);
    const second = await service.pageUsers({ limit: 100, cursor: first.nextCursor });
    expect(second.items).toHaveLength(25);
    await expect(service.pageUsers({ cursor: 'tampered' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
