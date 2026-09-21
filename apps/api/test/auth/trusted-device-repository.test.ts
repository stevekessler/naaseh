import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PutCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const store = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('../../src/shared/dynamodb.js', () => ({ dynamodb: store, tableName: 'test-table' }));

import {
  indexLegacyTrustedDevice,
  renameTrustedDeviceForUser,
  revokeTrustedDeviceForUser,
  saveTrustedDevice,
} from '../../src/auth/trusted-device-repository.js';

const hash = 'a'.repeat(64);
const record = {
  userId: 'steve',
  sessionEpoch: 3,
  credentialVersion: 2,
  expiresAt: '2026-10-20T00:00:00.000Z',
  createdAt: '2026-09-20T00:00:00.000Z',
  lastUsedAt: '2026-09-20T00:00:00.000Z',
  label: 'Chrome on iPad',
};

beforeEach(() => {
  vi.clearAllMocks();
  store.send.mockResolvedValue({});
});

describe('user-scoped remembered browser persistence', () => {
  it('atomically stores a token digest and list entry with the same fixed expiry', async () => {
    await saveTrustedDevice(hash, record);
    const command = store.send.mock.calls[0]?.[0] as TransactWriteCommand;
    expect(command).toBeInstanceOf(TransactWriteCommand);
    expect(command.input.TransactItems).toEqual([
      expect.objectContaining({
        Put: expect.objectContaining({
          Item: expect.objectContaining({
            PK: `TRUSTEDDEVICE#${hash}`,
            SK: 'TFA',
            expiresAt: 1792454400,
          }),
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      }),
      expect.objectContaining({
        Put: expect.objectContaining({
          Item: expect.objectContaining({
            PK: 'USER#steve',
            SK: `TRUSTEDDEVICE#${hash}`,
            expiresAt: 1792454400,
          }),
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      }),
    ]);
  });

  it('adds a legacy index without moving its original expiration', async () => {
    await indexLegacyTrustedDevice(hash, record);
    const command = store.send.mock.calls[0]?.[0] as PutCommand;
    expect(command).toBeInstanceOf(PutCommand);
    expect(command.input.Item).toMatchObject({
      PK: 'USER#steve',
      SK: `TRUSTEDDEVICE#${hash}`,
      expiresAt: 1792454400,
    });
  });

  it('cannot revoke a browser without an index owned by the signed-in user', async () => {
    store.send.mockResolvedValueOnce({});
    expect(await revokeTrustedDeviceForUser('other-user', hash)).toBe(false);
    expect(store.send).toHaveBeenCalledTimes(1);
    store.send.mockResolvedValueOnce({ Item: { PK: 'USER#steve' } });
    expect(await revokeTrustedDeviceForUser('steve', hash)).toBe(true);
    const command = store.send.mock.calls[2]?.[0] as TransactWriteCommand;
    expect(command.input.TransactItems?.[0]?.Delete).toMatchObject({
      Key: { PK: 'USER#steve', SK: `TRUSTEDDEVICE#${hash}` },
      ConditionExpression: 'attribute_exists(PK)',
    });
  });

  it('renames only an existing entry in the signed-in user partition', async () => {
    expect(await renameTrustedDeviceForUser('steve', hash, 'Steve’s MacBook Pro')).toBe(true);
    const command = store.send.mock.calls[0]?.[0] as UpdateCommand;
    expect(command.input).toMatchObject({
      Key: { PK: 'USER#steve', SK: `TRUSTEDDEVICE#${hash}` },
      ConditionExpression: 'attribute_exists(PK)',
      ExpressionAttributeValues: { ':label': 'Steve’s MacBook Pro' },
    });
  });
});
