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
    });
    expect(view).not.toHaveProperty('passwordHash');
    expect(view).not.toHaveProperty('pinHash');
  });
});
