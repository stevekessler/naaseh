import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requiredTfaNextStep } from '../../src/auth/tfa-service.js';

const store = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('../../src/shared/dynamodb.js', () => ({ dynamodb: store, tableName: 'test-table' }));

import { userByUsername } from '../../src/auth/user-repository.js';

const legacyAdministrator = {
  id: 'admin-1',
  username: 'steve',
  displayName: 'Steve',
  role: 'admin' as const,
  active: true,
  sessionEpoch: 0,
  passwordHash: '$argon2id$password',
  pinHash: '$argon2id$pin',
  pepperVersion: 'pepper-version-1',
};

beforeEach(() => vi.clearAllMocks());

describe('stored user compatibility', () => {
  it('applies security defaults before a legacy administrator enters TFA enrollment', async () => {
    store.send.mockResolvedValue({ Item: { data: legacyAdministrator } });

    const user = await userByUsername('Steve');

    expect(user).toMatchObject({
      id: 'admin-1',
      username: 'steve',
      credentialVersion: 0,
      tfaStatus: 'disabled',
      version: 1,
    });
    expect(user && requiredTfaNextStep(user)).toBe('tfa_enrollment');
  });
});
