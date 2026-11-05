import type { GroupMembership } from '@naaseh/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { BatchGetCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { createFinanceQueryRuntime } from '../../apps/api/src/finance/query-runtime.js';
import { dynamodb } from '../../apps/api/src/shared/dynamodb.js';
import { financeLocatorKey } from '../../apps/api/src/finance/unit-of-work.js';
import { buildExperienceAccounts, experienceId } from '../fixtures/finance/experience.js';
import type { FinanceQueryJob } from '../../apps/api/src/finance/query-job-service.js';

function setup(count: number, memberships: GroupMembership[] = []) {
  vi.stubEnv('CURSOR_SIGNING_SECRET', 'a'.repeat(32));
  const rows = new Map<string, Record<string, unknown>>();
  const key = (value: { PK: unknown; SK: unknown }) => JSON.stringify([value.PK, value.SK]);
  const user = {
    id: 'u1',
    role: 'user',
    active: true,
    version: 1,
    sessionEpoch: 0,
    credentialVersion: 1,
  };
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        user,
        memberships: memberships.map((m) => [m.groupId, m.role, m.version]).sort(),
      }),
    )
    .digest('hex');
  rows.set(key({ PK: 'USER#u1', SK: 'PROFILE' }), { data: user });
  const sourceRevisions: Record<string, string> = { $authorization: fingerprint };
  const accountIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = experienceId(100 + i);
    accountIds.push(id);
    sourceRevisions[id] = JSON.stringify([1, 1]);
    const storageKey = { PK: 'FINANCE#SCOPE#OWNER#u1', SK: `ROW#accounts#${i}` };
    rows.set(key(financeLocatorKey('accounts', id)), { storageKey });
    rows.set(key(storageKey), {
      ...storageKey,
      collection: 'accounts',
      entryKey: id,
      data: { ...buildExperienceAccounts()[0]!, id, scope: { type: 'owner', ownerId: 'u1' } },
    });
    rows.set(key({ PK: `FINANCE#PROJECTION_ACCOUNT#${id}`, SK: 'CURRENT' }), {
      state: 'ready',
      coverageVerified: true,
      coverageDependencies: { [storageKey.PK]: 1 },
      revision: 1,
      sourceScopeRevision: 1,
    });
  }
  rows.set(key({ PK: 'FINANCE#SCOPE#OWNER#u1', SK: 'META' }), { revision: 1 });
  const job: FinanceQueryJob = {
    id: experienceId(999),
    userId: 'u1',
    securityRevision: 0,
    sourceRevisions,
    filters: {},
    fingerprint: 'synthetic',
    partitions: accountIds.map((accountId) => ({ accountId, complete: true })),
    firstIds: [],
    totals: [],
    count: 0,
    examined: 0,
    state: 'exact',
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + 60_000,
    version: 1,
  };
  rows.set(key({ PK: 'USER#u1', SK: `FINANCE_QUERY#${job.id}` }), { data: job });
  const commands: Array<GetCommand | BatchGetCommand | QueryCommand> = [];
  let budgetRead = () => {};
  vi.spyOn(dynamodb, 'send').mockImplementation(async (command) => {
    commands.push(command as GetCommand | BatchGetCommand | QueryCommand);
    if (command instanceof GetCommand)
      return { Item: rows.get(key(command.input.Key as { PK: unknown; SK: unknown })) };
    if (command instanceof QueryCommand) {
      expect(command.input.ConsistentRead).toBe(true);
      return { Items: memberships.map((data) => ({ data })) };
    }
    if (command instanceof BatchGetCommand) {
      if (
        Object.values(command.input.RequestItems ?? {}).some((input) =>
          (input.Keys ?? []).some((key) => String(key.SK).startsWith('ROW#budgets#')),
        )
      )
        budgetRead();
      return {
        Responses: Object.fromEntries(
          Object.entries(command.input.RequestItems ?? {}).map(([table, input]) => [
            table,
            (input.Keys ?? [])
              .map((k) => ({ ...k, ...rows.get(key(k as { PK: unknown; SK: unknown })) }))
              .filter((row) => rows.has(key(row as { PK: unknown; SK: unknown }))),
          ]),
        ),
      };
    }
    throw new Error('Unexpected authority command.');
  });
  return {
    rows,
    key,
    commands,
    job,
    beforeBudgetRead: (callback: () => void) => {
      budgetRead = callback;
    },
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Finance query canonical source authority', () => {
  it('binds hydrated rows to saved identifiers, accounts and effective instants', async () => {
    const f = setup(1);
    const accountId = f.job.partitions[0]!.accountId;
    const id = experienceId(2001);
    const effectiveAt = '2026-10-15T12:00:00.000Z';
    const fact = {
      id,
      accountId,
      effectiveAt,
      currency: 'USD',
      currencyExponent: 2,
      amountMinor: -100,
      description: 'Synthetic row',
      sourceVersion: 1,
      slices: [],
    };
    f.job.firstIds = [{ id, accountId, effectiveAt }];
    f.job.count = 1;
    const key = f.key({ PK: `FINANCE#FACT#${id}`, SK: 'CURRENT' });
    f.rows.set(key, { fact });
    const runtime = createFinanceQueryRuntime({ authorizeDelivery: async () => true });
    expect((await runtime.status('u1', f.job.id)).items).toHaveLength(1);
    for (const change of [
      { id: experienceId(2002) },
      { accountId: experienceId(2003) },
      { effectiveAt: '2026-10-16T12:00:00.000Z' },
    ]) {
      f.rows.set(key, { fact: { ...fact, ...change } });
      await expect(runtime.status('u1', f.job.id)).rejects.toThrow(/identity|source/i);
    }
  });
  it('rechecks budget source access on saved exact results when the budget changes audience', async () => {
    const groupId = experienceId(3001);
    const budgetId = experienceId(3002);
    const f = setup(1, [
      {
        groupId,
        userId: 'u1',
        role: 'member',
        status: 'active',
        joinedAt: '2026-10-01T00:00:00.000Z',
        joinedBy: 'u1',
        version: 1,
      },
    ]);
    const accountId = f.job.partitions[0]!.accountId;
    const id = experienceId(3003);
    const effectiveAt = '2026-10-15T12:00:00.000Z';
    f.job.firstIds = [{ id, accountId, effectiveAt }];
    f.job.count = 1;
    f.rows.set(f.key({ PK: `FINANCE#FACT#${id}`, SK: 'CURRENT' }), {
      fact: {
        id,
        accountId,
        effectiveAt,
        currency: 'USD',
        currencyExponent: 2,
        amountMinor: -100,
        description: 'Synthetic budget row',
        sourceVersion: 1,
        slices: [
          {
            transactionId: id,
            accountId,
            effectiveAt,
            currency: 'USD',
            currencyExponent: 2,
            amountMinor: 100,
            budgetId,
          },
        ],
      },
    });
    const locator = financeLocatorKey('budgets', budgetId);
    const saveBudget = (audience: string) => {
      const storageKey = { PK: `FINANCE#SCOPE#GROUP#${audience}`, SK: 'ROW#budgets#synthetic' };
      f.rows.set(f.key(locator), { storageKey });
      f.rows.set(f.key(storageKey), {
        ...storageKey,
        entryKey: budgetId,
        collection: 'budgets',
        data: { id: budgetId, groupId: audience },
      });
    };
    saveBudget(groupId);
    const runtime = createFinanceQueryRuntime({ authorizeDelivery: async () => true });
    expect((await runtime.status('u1', f.job.id)).items).toHaveLength(1);
    let unlocked = true;
    const racing = createFinanceQueryRuntime({ authorizeDelivery: async () => unlocked });
    f.beforeBudgetRead(() => {
      unlocked = false;
    });
    await expect(racing.status('u1', f.job.id)).rejects.toThrow(/access|authorization|unlock/i);
    f.beforeBudgetRead(() => {});
    saveBudget(experienceId(3004));
    await expect(runtime.status('u1', f.job.id)).rejects.toThrow(/access|authorization|source/i);
  });

  it('rejects missing or partial canonical coverage even when source revisions match', async () => {
    const f = setup(1);
    const accountId = f.job.partitions[0]!.accountId;
    const markerKey = f.key({ PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`, SK: 'CURRENT' });
    const marker = f.rows.get(markerKey)!;
    const runtime = createFinanceQueryRuntime({ authorizeDelivery: async () => true });
    for (const coverageVerified of [undefined, false]) {
      f.rows.set(markerKey, { ...marker, coverageVerified });
      await expect(runtime.status('u1', f.job.id)).rejects.toThrow(/source|authorization/i);
    }
    f.rows.set(markerKey, {
      ...marker,
      coverageVerified: true,
      coverageDependencies: { 'FINANCE#SCOPE#OWNER#u1': 2 },
    });
    await expect(runtime.status('u1', f.job.id)).rejects.toThrow(/source|authorization/i);
  });

  it('validates fifty source accounts in bounded batches and gives background computation no delivery grant', async () => {
    const f = setup(50);
    await expect(createFinanceQueryRuntime().status('u1', f.job.id)).rejects.toThrow(
      /unlock required/i,
    );
    expect(f.commands.length).toBeLessThanOrEqual(8);
    const profile = f.commands.find(
      (c) => c instanceof GetCommand && c.input.Key?.SK === 'PROFILE',
    ) as GetCommand;
    expect(profile.input.ProjectionExpression).not.toMatch(/password|pinHash|pepper/i);
  });

  it('rechecks current source revisions and delivery authorization instead of returning stale exact totals', async () => {
    const f = setup(1);
    let unlocked = true;
    const runtime = createFinanceQueryRuntime({ authorizeDelivery: async () => unlocked });
    expect(await runtime.status('u1', f.job.id)).toMatchObject({
      aggregateState: 'exact',
      totalCount: 0,
    });
    unlocked = false;
    await expect(runtime.status('u1', f.job.id)).rejects.toThrow(/unlock/i);
    unlocked = true;
    f.rows.set(f.key({ PK: 'FINANCE#SCOPE#OWNER#u1', SK: 'META' }), { revision: 2 });
    await expect(runtime.status('u1', f.job.id)).rejects.toThrow(/source|authorization/i);
  });
});
