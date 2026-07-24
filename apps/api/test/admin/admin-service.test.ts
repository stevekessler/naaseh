import { describe, expect, it } from 'vitest';
import { categorySchema, type UserRecord } from '@naaseh/domain';
import {
  createUserAdminService,
  type UserAdminRepository,
} from '../../src/admin/user-admin-service.js';
import { canonicalUsername } from '../../src/auth/user-repository.js';
import {
  createProvisionUserService,
  type ProvisionUserDependencies,
} from '../../src/admin/provision-user.js';

function repository(seed: UserRecord[]): UserAdminRepository {
  const users = new Map(seed.map((user) => [user.id, structuredClone(user)]));
  return {
    list: async () => [...users.values()],
    get: async (id) => users.get(id),
    setStatus: async (id, active, expectedEpoch) => {
      const current = users.get(id)!;
      if (current.sessionEpoch !== expectedEpoch) throw new Error('conflict');
      const next = { ...current, active, sessionEpoch: current.sessionEpoch + 1 };
      users.set(id, next);
      return next;
    },
  };
}

const admin: UserRecord = {
  id: 'admin',
  username: 'steve',
  displayName: 'Steve',
  role: 'admin',
  active: true,
  sessionEpoch: 2,
};
const user: UserRecord = {
  id: 'user',
  username: 'alex',
  displayName: 'Alex',
  role: 'user',
  active: true,
  sessionEpoch: 4,
};

describe('administration rules', () => {
  it('canonicalizes usernames and rejects duplicate category names through canonical claims', () => {
    expect(canonicalUsername(' Steve ')).toBe('steve');
    expect(canonicalUsername('Ｓteve')).toBe('steve');
    const canonicalCategory = (name: string) =>
      name.trim().normalize('NFKC').toLocaleLowerCase('en-US');
    expect(canonicalCategory(' Calls ')).toBe(canonicalCategory('Ｃalls'));
  });

  it('increments the session epoch on disablement and reactivation', async () => {
    const service = createUserAdminService(repository([admin, user]));
    const disabled = await service.setUserActive(admin.id, user.id, false);
    expect(disabled).toMatchObject({ active: false, sessionEpoch: 5 });
    const reactivated = await service.setUserActive(admin.id, user.id, true);
    expect(reactivated).toMatchObject({ active: true, sessionEpoch: 6 });
  });

  it('preserves historical identity and makes repeated status changes idempotent', async () => {
    const service = createUserAdminService(repository([admin, user]));
    const unchanged = await service.setUserActive(admin.id, user.id, true);
    expect(unchanged).toMatchObject({
      id: user.id,
      displayName: user.displayName,
      sessionEpoch: 4,
    });
  });

  it('prevents self-disablement and preserves archived category defaults for historical references', async () => {
    const service = createUserAdminService(repository([admin]));
    await expect(service.setUserActive(admin.id, admin.id, false)).rejects.toMatchObject({
      statusCode: 409,
    });
    const category = categorySchema.parse({
      id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      name: 'Calls',
      color: '#06366b',
      defaultAssigneeId: user.id,
      archived: true,
    });
    expect(category).toMatchObject({ archived: true, defaultAssigneeId: user.id });
  });

  it('prevents disabling the last active administrator', async () => {
    const service = createUserAdminService(repository([admin, user]));
    await expect(service.setUserActive(user.id, admin.id, false)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('provisions through one idempotent service without returning credential hashes', async () => {
    const records = new Map<
      string,
      UserRecord & { passwordHash: string; pinHash: string; pepperVersion: string }
    >();
    const dependencies: ProvisionUserDependencies = {
      findByIdempotencyToken: async (token) => records.get(token),
      create: async (value, token) => {
        records.set(token, value);
      },
      hashSecret: async (value) => `argon2:${value.length}`,
      newId: () => '01J00000000000000000000000',
    };
    const provision = createProvisionUserService(dependencies);
    const request = {
      version: 'naaseh.provision-user/v1' as const,
      username: ' Steve ',
      displayName: 'Steve',
      password: 'correct horse battery staple',
      pin: '246810',
      role: 'admin' as const,
      idempotencyToken: 'request-1',
    };
    const first = await provision(request, 'pepper', 'version-1');
    const retry = await provision(request, 'pepper', 'version-1');
    expect(first).toMatchObject({ created: true, user: { username: 'steve', role: 'admin' } });
    expect(retry).toMatchObject({ created: false, user: first.user });
    expect(JSON.stringify(first)).not.toMatch(/password|pin|pepper|argon2/i);
  });
});
