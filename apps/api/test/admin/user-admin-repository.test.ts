import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserRecord } from '@naaseh/domain';

const store = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('../../src/shared/dynamodb.js', () => ({ dynamodb: store, tableName: 'test-table' }));
vi.mock('../../src/groups/group-repository.js', () => ({
  getGroup: vi.fn(),
  listUserMemberships: vi.fn(),
}));

import { dynamoUserAdminRepository } from '../../src/admin/user-admin-service.js';

beforeEach(() => vi.clearAllMocks());

describe('administrator user repository', () => {
  it('replaces an unchanged legacy username snapshot while updating the canonical profile', async () => {
    const current: UserRecord = {
      id: 'heather-id',
      username: 'heather',
      displayName: 'Heather',
      role: 'user',
      active: true,
      sessionEpoch: 2,
      credentialVersion: 0,
      version: 3,
    };
    store.send.mockResolvedValue({});

    await dynamoUserAdminRepository.update!(
      current,
      {
        username: 'heather',
        displayName: 'Heather',
        role: 'user',
        tfaStatus: 'disabled',
        passwordHash: 'new-password-hash',
        pepperVersion: 'pepper-version-1',
      },
      3,
    );

    const command = store.send.mock.calls[0]![0] as { input: Record<string, any> };
    expect(command.input.TransactItems).toHaveLength(2);
    expect(command.input.TransactItems[0].Put.Item).toEqual({
      PK: 'USERNAME#heather',
      SK: 'USER',
      data: { userId: 'heather-id', canonicalUsername: 'heather' },
    });
    expect(command.input.TransactItems[1].Update.Key).toEqual({
      PK: 'USER#heather-id',
      SK: 'PROFILE',
    });
  });
});
