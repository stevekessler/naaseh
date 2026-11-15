import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { financeDashboardPreferencesResponseSchema } from '@naaseh/contracts';
import { describe, expect, it, vi } from 'vitest';
import { FinanceDashboardPreferenceService } from '../../apps/api/src/finance/dashboard-preference-service.js';
import { buildExperienceFixture, experienceId } from '../fixtures/finance/experience.js';

const now = new Date('2026-11-15T18:00:00.000Z');
const target = { targetKind: 'account', targetId: experienceId(1) } as const;

function fixture() {
  const { actors } = buildExperienceFixture();
  const owner = actors.owner;
  const other = { ...owner, id: 'different-dashboard-owner', role: 'admin' as const };
  const allowed = new Set([target.targetId]);
  const rows = new Map<string, Record<string, unknown>>();
  const fence = {
    ConditionCheck: {
      TableName: 'finance-table',
      Key: { PK: `FINANCE#ACCOUNT#${target.targetId}`, SK: 'CURRENT' },
      ConditionExpression: '#version = :expected',
      ExpressionAttributeNames: { '#version': 'version' },
      ExpressionAttributeValues: { ':expected': 4 },
    },
  };
  let sourceVersion = 4;
  const send = vi.fn(async (command: GetCommand | QueryCommand | TransactWriteCommand) => {
    if (command instanceof QueryCommand) {
      const pk = command.input.ExpressionAttributeValues?.[':pk'];
      const prefix = String(command.input.ExpressionAttributeValues?.[':prefix']);
      return {
        Items: [...rows.values()].filter(
          (row) => row.PK === pk && String(row.SK).startsWith(prefix),
        ),
      };
    }
    if (command instanceof GetCommand) {
      const key = command.input.Key;
      return { Item: rows.get(`${key?.PK}|${key?.SK}`) };
    }
    for (const item of command.input.TransactItems ?? []) {
      if (
        item.ConditionCheck &&
        sourceVersion !== item.ConditionCheck.ExpressionAttributeValues?.[':expected']
      )
        throw new Error('source changed');
      const put = item.Put;
      if (!put) continue;
      const key = `${put.Item?.PK}|${put.Item?.SK}`;
      const expected = put.ExpressionAttributeValues?.[':expected'];
      if (expected === undefined ? rows.has(key) : rows.get(key)?.version !== expected)
        throw new Error('preference version conflict');
      rows.set(key, put.Item!);
    }
    return {};
  });
  const service = new FinanceDashboardPreferenceService({
    client: { send: send as never },
    tableName: 'finance-table',
    now: () => now,
    authorizeTarget: async (_actor, value) => (allowed.has(value.targetId) ? [fence] : undefined),
  });
  return {
    service,
    owner,
    other,
    allowed,
    send,
    revokeAtCommit: () => {
      sourceVersion++;
    },
  };
}

describe('Finance dashboard preferences', () => {
  it('defaults to no flags and ten upcoming rows without writing defaults', async () => {
    const { service, owner, send } = fixture();
    const response = await service.read(owner);
    expect(financeDashboardPreferencesResponseSchema.parse(response)).toEqual({
      flags: [],
      settings: { upcomingCount: 10, version: 0 },
    });
    expect(send.mock.calls.map(([command]) => command.constructor.name)).toEqual(['QueryCommand']);
  });

  it('keeps flags and count in the caller partition, including for administrators', async () => {
    const { service, owner, other } = fixture();
    await service.setFlag(owner, target, { included: true });
    await service.setUpcomingCount(owner, { upcomingCount: 15, expectedVersion: 0 });
    await service.setFlag(other, target, { included: false });
    expect(await service.read(owner)).toEqual({
      flags: [{ ...target, included: true, version: 1 }],
      settings: { upcomingCount: 15, version: 1 },
    });
    expect(await service.read(other)).toEqual({
      flags: [{ ...target, included: false, version: 1 }],
      settings: { upcomingCount: 10, version: 0 },
    });
  });

  it('rejects competing revisions and allows a checked update', async () => {
    const { service, owner } = fixture();
    await service.setFlag(owner, target, { included: true });
    await expect(service.setFlag(owner, target, { included: false })).rejects.toThrow(
      'preference version conflict',
    );
    await expect(
      service.setFlag(owner, target, { included: false, expectedVersion: 1 }),
    ).resolves.toEqual({ ...target, included: false, version: 2 });
    await service.setUpcomingCount(owner, { upcomingCount: 5, expectedVersion: 0 });
    await expect(
      service.setUpcomingCount(owner, { upcomingCount: 20, expectedVersion: 0 }),
    ).rejects.toThrow('preference version conflict');
  });

  it('hides dormant flags on revocation and restores them when access returns', async () => {
    const { service, owner, allowed } = fixture();
    await service.setFlag(owner, target, { included: true });
    allowed.clear();
    expect((await service.read(owner)).flags).toEqual([]);
    await expect(
      service.setFlag(owner, target, { included: false, expectedVersion: 1 }),
    ).rejects.toThrow('Finance record not found.');
    allowed.add(target.targetId);
    expect((await service.read(owner)).flags).toEqual([{ ...target, included: true, version: 1 }]);
  });

  it('binds the preference write to the current target source and leaves the flag absent on conflict', async () => {
    const { service, owner, revokeAtCommit } = fixture();
    revokeAtCommit();
    await expect(service.setFlag(owner, target, { included: true })).rejects.toThrow(
      'source changed',
    );
    expect((await service.read(owner)).flags).toEqual([]);
  });

  it('rejects cross-owner inputs, unsupported counts, and inactive actors before writing', async () => {
    const { service, owner, send } = fixture();
    await expect(
      service.setFlag(owner, target, { included: true, ownerId: 'another-user' }),
    ).rejects.toThrow();
    await expect(
      service.setUpcomingCount(owner, { upcomingCount: 11, expectedVersion: 0 }),
    ).rejects.toThrow();
    await expect(service.read({ ...owner, active: false })).rejects.toThrow(
      'Finance record not found.',
    );
    expect(send).not.toHaveBeenCalled();
  });
});
