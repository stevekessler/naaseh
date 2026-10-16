import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requiredTfaNextStep } from '../../src/auth/tfa-service.js';

const store = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('../../src/shared/dynamodb.js', () => ({ dynamodb: store, tableName: 'test-table' }));

import {
  commitPasswordReset,
  putUser,
  syncBrokerActiveProjection,
  userByUsername,
} from '../../src/auth/user-repository.js';

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

  it('reads an imported account that does not have browser credentials yet', async () => {
    store.send.mockResolvedValue({
      Item: {
        data: {
          id: 'user-without-password',
          username: 'heather',
          displayName: 'Heather',
          role: 'user',
          active: true,
          sessionEpoch: 0,
        },
      },
    });

    await expect(userByUsername('heather')).resolves.toMatchObject({
      id: 'user-without-password',
      username: 'heather',
      credentialVersion: 0,
      version: 1,
    });
  });

  it('can commit a password reset to a legacy row without an explicit version', async () => {
    store.send.mockResolvedValue({});
    await commitPasswordReset({
      userId: 'legacy-user',
      passwordHash: 'new-hash',
      expectedVersion: 1,
      nextCredentialVersion: 1,
      nextSessionEpoch: 1,
      retainedTfaStatus: 'disabled',
    });
    const command = store.send.mock.calls[0]![0] as { input: Record<string, unknown> };
    expect(command.input.ConditionExpression).toContain('attribute_not_exists');
    expect(command.input.ExpressionAttributeValues).toMatchObject({
      ':expectedVersion': 1,
      ':legacyVersion': 1,
    });
  });

  it('writes only a top-level active projection for broker authorization', async () => {
    store.send.mockResolvedValue({});
    await putUser(legacyAdministrator);
    const command = store.send.mock.calls[0]![0] as { input: Record<string, any> };
    const profile = command.input.TransactItems[1].Put.Item;
    expect(profile.brokerActive).toBe(true);
    expect(profile.data.passwordHash).toBe(legacyAdministrator.passwordHash);
  });

  it('synchronizes the projection from the stored active value without reading credentials', async () => {
    store.send.mockResolvedValue({});
    await syncBrokerActiveProjection('admin-1');
    const command = store.send.mock.calls[0]![0] as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({
      Key: { PK: 'USER#admin-1', SK: 'PROFILE' },
      UpdateExpression: 'SET brokerActive = #data.#active',
    });
  });
});
