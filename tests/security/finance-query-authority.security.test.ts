import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { BatchGetCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { createFinanceQueryRuntime } from '../../apps/api/src/finance/query-runtime.js';
import { dynamodb } from '../../apps/api/src/shared/dynamodb.js';
import { financeLocatorKey } from '../../apps/api/src/finance/unit-of-work.js';
import { buildExperienceAccounts, experienceId } from '../fixtures/finance/experience.js';
import type { FinanceQueryJob } from '../../apps/api/src/finance/query-job-service.js';

function setup(count: number) {
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
    .update(JSON.stringify({ user, memberships: [] }))
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
  vi.spyOn(dynamodb, 'send').mockImplementation(async (command) => {
    commands.push(command as GetCommand | BatchGetCommand | QueryCommand);
    if (command instanceof GetCommand)
      return { Item: rows.get(key(command.input.Key as { PK: unknown; SK: unknown })) };
    if (command instanceof QueryCommand) {
      expect(command.input.ConsistentRead).toBe(true);
      return { Items: [] };
    }
    if (command instanceof BatchGetCommand)
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
    throw new Error('Unexpected authority command.');
  });
  return { rows, key, commands, job };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Finance query canonical source authority', () => {
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
