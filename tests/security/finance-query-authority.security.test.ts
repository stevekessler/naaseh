import type { GroupMembership } from '@naaseh/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { BatchGetCommand, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { createFinanceQueryRuntime } from '../../apps/api/src/finance/query-runtime.js';
import { dynamodb } from '../../apps/api/src/shared/dynamodb.js';
import { financeLocatorKey } from '../../apps/api/src/finance/unit-of-work.js';
import { buildExperienceAccounts, experienceId } from '../fixtures/finance/experience.js';
import type {
  FinanceQueryJob,
  FinanceQueryJobStore,
} from '../../apps/api/src/finance/query-job-service.js';
import { createFinanceAccountReadSummary } from '../../apps/api/src/finance/account-read-summary.js';

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
    rowOrderVersion: 2,
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
function setupCreation(count: number) {
  const fixture = setup(count);
  const jobs = new Map<string, FinanceQueryJob>();
  const save = vi.fn(async (job: FinanceQueryJob, expectedVersion: number) => {
    expect(jobs.get(job.id)?.version ?? 0).toBe(expectedVersion);
    jobs.set(job.id, structuredClone(job));
    return structuredClone(job);
  });
  const store: FinanceQueryJobStore = {
    get: async (userId, id) => {
      const job = jobs.get(id);
      return job?.userId === userId ? structuredClone(job) : undefined;
    },
    save,
    create: vi.fn(async (job: FinanceQueryJob, requestId: string) => {
      expect(requestId).toBe('start-request-1');
      return save(job, 0);
    }),
  };
  const dispatch = vi.fn(async (_input: { userId: string; queryId: string }) => {
    void _input;
  });
  const visit = vi.fn(async () => true);
  const runtime = createFinanceQueryRuntime({ store, dispatch, authorizeDelivery: visit });
  const request = { accountIds: fixture.job.partitions.map((partition) => partition.accountId) };
  return { ...fixture, jobs, store, save, dispatch, visit, runtime, request };
}
function setupPreview(count: number) {
  const f = setupCreation(2);
  const facts = f.request.accountIds.flatMap((accountId, account) => {
    const key = f.key({ PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`, SK: 'CURRENT' });
    f.rows.set(key, {
      ...f.rows.get(key),
      sourceAccountProofVersion: 1,
      originalSourceAccountIds: [],
      accountIndexOrderVersion: 1,
    });
    return Array.from({ length: count }, (_, i) => {
      const id = experienceId(10000 + account * count + i);
      const effectiveAt = new Date(Date.UTC(2026, 9, 31) - i * 3600000).toISOString();
      const fact = {
        id,
        accountId,
        effectiveAt,
        sourceVersion: 1,
        currency: 'USD',
        currencyExponent: 2,
        amountMinor: -100,
        description: 'Synthetic',
        slices: [
          {
            transactionId: id,
            accountId,
            effectiveAt,
            currency: 'USD',
            currencyExponent: 2,
            amountMinor: 100,
          },
        ],
      };
      const primary = { PK: `FINANCE#FACT#${id}`, SK: 'CURRENT' };
      f.rows.set(f.key(primary), { ...primary, fact });
      const reference = {
        PK: `FINANCE#FACT_ACCOUNT#${accountId}`,
        SK: `DATE#${effectiveAt}#${id}`,
      };
      f.rows.set(f.key(reference), {
        ...reference,
        transactionId: id,
        aggregate: createFinanceAccountReadSummary(fact),
      });
      return fact;
    });
  });
  const send = vi.mocked(dynamodb.send);
  const original = send.getMockImplementation()!;
  send.mockImplementation(async (command) => {
    if (
      command instanceof QueryCommand &&
      String(command.input.ExpressionAttributeValues?.[':pk']).startsWith('FINANCE#FACT_ACCOUNT#')
    ) {
      f.commands.push(command);
      const pk = command.input.ExpressionAttributeValues?.[':pk'];
      const start = command.input.ExclusiveStartKey?.SK;
      const rows = [...f.rows.values()]
        .filter(
          (row) =>
            row.PK === pk &&
            String(row.SK).startsWith('DATE#') &&
            (!start || String(row.SK) < String(start)),
        )
        .sort((a, b) => (String(a.SK) < String(b.SK) ? 1 : -1));
      const Items = rows.slice(0, command.input.Limit);
      return {
        Items,
        ScannedCount: Items.length,
        ...(rows.length > Items.length
          ? { LastEvaluatedKey: { PK: pk, SK: Items.at(-1)!.SK } }
          : {}),
      };
    }
    return original(command);
  });
  return { ...f, facts };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Finance query canonical source authority', () => {
  it('delivers verified globally ordered preview rows while aggregates finish automatically', async () => {
    const f = setupPreview(1200);
    const id = await f.runtime.start('u1', 0, f.request);
    const first = await f.runtime.page('u1', id);
    expect(first).toMatchObject({ rowsState: 'ready', aggregateState: 'pending', complete: false });
    expect(first.totalCount).toBeUndefined();
    const expected = [...f.facts].sort(
      (a, b) => Date.parse(b.effectiveAt) - Date.parse(a.effectiveAt) || b.id.localeCompare(a.id),
    );
    expect(first.items).toEqual(expected.slice(0, 50));
    for (let step = 0; f.jobs.get(id)!.state !== 'exact' && step < 5; step++)
      await f.runtime.step('u1', id);
    const complete = await f.runtime.page('u1', id);
    expect(complete.items).toEqual(first.items);
    expect(complete).toMatchObject({
      aggregateState: 'exact',
      totalCount: 2400,
      totalsByCurrency: [{ amountMinor: 240000 }],
    });
    expect((await f.runtime.page('u1', id, { cursor: first.nextCursor })).items).toEqual(
      expected.slice(50, 100),
    );
    for (const command of f.commands)
      if (
        command instanceof QueryCommand &&
        String(command.input.ExpressionAttributeValues?.[':pk']).startsWith('FINANCE#FACT_')
      )
        expect(command.input.Limit).toBeLessThanOrEqual(1000);
  });

  it('keeps legacy coverage on automatic completion and withholds a preview when its visit locks', async () => {
    const legacy = setupPreview(20);
    const marker = legacy.key({
      PK: `FINANCE#PROJECTION_ACCOUNT#${legacy.request.accountIds[0]}`,
      SK: 'CURRENT',
    });
    delete legacy.rows.get(marker)!.accountIndexOrderVersion;
    const id = await legacy.runtime.start('u1', 0, legacy.request);
    expect(legacy.jobs.get(id)).toMatchObject({ state: 'pending', firstIds: [] });
    expect(
      legacy.commands.filter(
        (command) =>
          command instanceof QueryCommand &&
          String(command.input.ExpressionAttributeValues?.[':pk']).startsWith('FINANCE#FACT_'),
      ),
    ).toHaveLength(0);
    const locked = setupPreview(500);
    locked.visit.mockResolvedValueOnce(true).mockResolvedValue(false);
    await expect(locked.runtime.start('u1', 0, locked.request)).rejects.toThrow(
      /unlock|access|authoriz/i,
    );
    expect(locked.dispatch).not.toHaveBeenCalled();
    expect([...locked.jobs.values()][0]).toMatchObject({ state: 'pending', firstIds: [] });
  });
  it('does not treat missing or legacy text estimates as zero when selecting a narrower authorized dimension', async () => {
    const f = setup(1);
    const accountId = f.job.partitions[0]!.accountId;
    const merchantId = experienceId(5000);
    f.job.filters = { text: 'common', merchantIds: [merchantId] };
    f.job.state = 'pending';
    f.job.partitions[0]!.complete = false;
    const merchant = {
      PK: `FINANCE#FACT_DIM#merchant#${merchantId}#${accountId}`,
      SK: 'CARDINALITY',
    };
    f.rows.set(f.key(merchant), { ...merchant, facts: 5 });
    const legacy = { PK: `FINANCE#FACT_SEARCH#${accountId}#text#com`, SK: 'CARDINALITY' };
    f.rows.set(f.key(legacy), { ...legacy, facts: 0 });
    const runtime = createFinanceQueryRuntime({
      store: { get: async () => structuredClone(f.job), save: async (job) => structuredClone(job) },
      dispatch: async () => {},
    });
    await runtime.step('u1', f.job.id);
    const probes = () =>
      f.commands.filter(
        (command): command is QueryCommand =>
          command instanceof QueryCommand &&
          String(command.input.ExpressionAttributeValues?.[':pk']).startsWith('FINANCE#FACT_'),
      );
    expect(probes().at(-1)?.input.ExpressionAttributeValues?.[':pk']).toBe(merchant.PK);
    f.rows.set(f.key(merchant), { ...merchant, facts: 1000 });
    f.rows.set(f.key(legacy), { ...legacy, estimateKind: 'posting-chunks-v1', chunks: 1 });
    await runtime.step('u1', f.job.id);
    expect(probes().at(-1)?.input.ExpressionAttributeValues?.[':pk']).toBe(legacy.PK);
  });
  it('adds verified original-source accounts to the pinned vector without adding them to the selected rows', async () => {
    const f = setupCreation(2);
    const [selected, original] = f.request.accountIds;
    const marker = f.key({ PK: `FINANCE#PROJECTION_ACCOUNT#${selected}`, SK: 'CURRENT' });
    f.rows.set(marker, {
      ...f.rows.get(marker),
      sourceAccountProofVersion: 1,
      originalSourceAccountIds: [original],
    });
    const id = await f.runtime.start('u1', 0, { accountIds: [selected] });
    expect(f.jobs.get(id)).toMatchObject({
      sourceRevisions: f.job.sourceRevisions,
      partitions: [{ accountId: selected, complete: false }],
      filters: { accountIds: [selected] },
    });
    const originalAccount = f.key({ PK: 'FINANCE#SCOPE#OWNER#u1', SK: 'ROW#accounts#1' });
    const row = f.rows.get(originalAccount)!;
    f.rows.set(originalAccount, {
      ...row,
      data: { ...(row.data as object), scope: { type: 'owner', ownerId: 'another' } },
    });
    await expect(f.runtime.status('u1', id)).rejects.toThrow(/authoriz|source|restart/i);
  });

  it('rejects inaccessible, incomplete, malformed and oversized original-source coverage before saving a job', async () => {
    const f = setupCreation(2);
    const [selected, original] = f.request.accountIds;
    const marker = f.key({ PK: `FINANCE#PROJECTION_ACCOUNT#${selected}`, SK: 'CURRENT' });
    const originalMarker = f.key({ PK: `FINANCE#PROJECTION_ACCOUNT#${original}`, SK: 'CURRENT' });
    const originalRows = structuredClone([...f.rows]);
    for (const change of [
      () => f.rows.delete(f.key(financeLocatorKey('accounts', original!))),
      () => f.rows.set(originalMarker, { ...f.rows.get(originalMarker), coverageVerified: false }),
      () => f.rows.set(marker, { ...f.rows.get(marker), sourceAccountProofVersion: 9 }),
      () =>
        f.rows.set(marker, {
          ...f.rows.get(marker),
          originalSourceAccountIds: ['not-an-account-id'],
        }),
      () =>
        f.rows.set(marker, {
          ...f.rows.get(marker),
          originalSourceAccountIds: Array.from({ length: 101 }, (_, i) => experienceId(5000 + i)),
        }),
    ]) {
      f.rows.clear();
      for (const [key, value] of structuredClone(originalRows)) f.rows.set(key, value);
      f.rows.set(marker, {
        ...f.rows.get(marker),
        sourceAccountProofVersion: 1,
        originalSourceAccountIds: [original],
      });
      change();
      await expect(f.runtime.start('u1', 0, { accountIds: [selected] })).rejects.toThrow(
        /source|coverage|access|bound/i,
      );
    }
    expect(f.save).not.toHaveBeenCalled();
    expect(f.dispatch).not.toHaveBeenCalled();
    const bounded = setupCreation(50);
    for (const [index, accountId] of bounded.request.accountIds.entries()) {
      const key = bounded.key({ PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`, SK: 'CURRENT' });
      bounded.rows.set(key, {
        ...bounded.rows.get(key),
        sourceAccountProofVersion: 1,
        originalSourceAccountIds: [experienceId(5000 + index * 2), experienceId(5001 + index * 2)],
      });
    }
    await expect(bounded.runtime.start('u1', 0, bounded.request)).rejects.toThrow(/bound/i);
    expect(bounded.save).not.toHaveBeenCalled();
  });

  it('withholds refund rows and totals when an unselected original account is revoked during fact hydration', async () => {
    const f = setupCreation(2);
    const [selected, original] = f.request.accountIds;
    const marker = f.key({ PK: `FINANCE#PROJECTION_ACCOUNT#${selected}`, SK: 'CURRENT' });
    f.rows.set(marker, {
      ...f.rows.get(marker),
      sourceAccountProofVersion: 1,
      originalSourceAccountIds: [original],
    });
    const id = await f.runtime.start('u1', 0, { accountIds: [selected] });
    const fact = {
      id: experienceId(5000),
      accountId: selected!,
      effectiveAt: '2026-10-01T12:00:00.000Z',
      currency: 'USD',
      currencyExponent: 2,
      amountMinor: 50,
      description: 'Synthetic linked credit',
      sourceVersion: 1,
      slices: [],
      originalSourceAccountIds: [original!],
    };
    const factKey = { PK: `FINANCE#FACT#${fact.id}`, SK: 'CURRENT' };
    f.rows.set(f.key(factKey), { ...factKey, fact });
    f.jobs.set(id, {
      ...f.jobs.get(id)!,
      state: 'exact',
      count: 1,
      firstIds: [{ id: fact.id, accountId: fact.accountId, effectiveAt: fact.effectiveAt }],
    });
    expect((await f.runtime.status('u1', id)).items).toEqual([fact]);
    const send = vi.mocked(dynamodb.send);
    const implementation = send.getMockImplementation()!;
    send.mockImplementation(async (command) => {
      const result = await implementation(command);
      if (
        command instanceof BatchGetCommand &&
        Object.values(command.input.RequestItems ?? {}).some((input) =>
          input.Keys?.some((key) => key.PK === factKey.PK),
        )
      ) {
        const key = f.key({ PK: 'FINANCE#SCOPE#OWNER#u1', SK: 'ROW#accounts#1' });
        const row = f.rows.get(key)!;
        f.rows.set(key, {
          ...row,
          data: { ...(row.data as object), scope: { type: 'owner', ownerId: 'another' } },
        });
      }
      return result;
    });
    await expect(f.runtime.status('u1', id)).rejects.toThrow(/source|authoriz|restart/i);
  });
  it('uses canonical administrator ownership for bounded queries without admitting foreign accounts', async () => {
    const f = setupCreation(1);
    const profile = f.rows.get(f.key({ PK: 'USER#u1', SK: 'PROFILE' }))!;
    (profile.data as Record<string, unknown>).role = 'admin';
    const id = await f.runtime.start('u1', 0, f.request, 'start-request-1');
    expect(f.jobs.get(id)?.userId).toBe('u1');
    await expect(f.runtime.status('u1', id)).resolves.toBeDefined();
    const locator = f.rows.get(f.key(financeLocatorKey('accounts', f.request.accountIds[0]!)))!;
    const account = f.rows.get(f.key(locator.storageKey as { PK: unknown; SK: unknown }))!;
    (account.data as Record<string, unknown>).scope = { type: 'owner', ownerId: 'other' };
    await expect(f.runtime.status('u1', id)).rejects.toThrow(/source|authoriz|restart/i);
  });
  it('starts a bounded job using canonical owner/source revisions rather than caller authority', async () => {
    const f = setupCreation(50);
    const id = await f.runtime.start(
      'u1',
      0,
      { ...f.request, filters: { checkNumber: ' 00123 ' } },
      'start-request-1',
    );
    expect(f.jobs.get(id)).toMatchObject({
      userId: 'u1',
      securityRevision: 0,
      sourceRevisions: f.job.sourceRevisions,
      state: 'pending',
      filters: { checkNumber: '00123', accountIds: f.request.accountIds },
    });
    expect(f.save).toHaveBeenCalledOnce();
    expect(f.store.create).toHaveBeenCalledOnce();
    expect(f.dispatch).toHaveBeenCalledExactlyOnceWith({ userId: 'u1', queryId: id });
    expect(f.commands.length).toBeLessThanOrEqual(14);
    for (const command of f.commands) {
      if (command instanceof QueryCommand)
        expect(command.input.ExpressionAttributeValues?.[':prefix']).toBe('GROUP#');
      if (command instanceof BatchGetCommand)
        for (const request of Object.values(command.input.RequestItems ?? {}))
          expect(request.Keys!.length).toBeLessThanOrEqual(100);
    }
  });

  it('does not save or dispatch a job for missing, partial, or unauthorized canonical coverage', async () => {
    const f = setupCreation(1);
    const accountId = f.request.accountIds[0]!;
    const markerKey = f.key({ PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`, SK: 'CURRENT' });
    const accountKey = f.key({ PK: 'FINANCE#SCOPE#OWNER#u1', SK: 'ROW#accounts#0' });
    const original = structuredClone([...f.rows]);
    for (const change of [
      () => f.rows.delete(f.key(financeLocatorKey('accounts', accountId))),
      () => f.rows.set(markerKey, { ...f.rows.get(markerKey), coverageVerified: false }),
      () => f.rows.set(markerKey, { ...f.rows.get(markerKey), coverageDeferredSourceCount: 1 }),
      () => {
        const row = f.rows.get(accountKey)!;
        f.rows.set(accountKey, {
          ...row,
          data: { ...(row.data as object), scope: { type: 'owner', ownerId: 'another-owner' } },
        });
      },
    ]) {
      f.rows.clear();
      for (const [key, value] of structuredClone(original)) f.rows.set(key, value);
      change();
      await expect(f.runtime.start('u1', 0, f.request)).rejects.toThrow(/access|source|coverage/i);
    }
    expect(f.save).not.toHaveBeenCalled();
    expect(f.dispatch).not.toHaveBeenCalled();
  });

  it('rejects forged authority, contradictory account filters and oversized scopes before storage reads', async () => {
    const f = setupCreation(1);
    for (const request of [
      { ...f.request, userId: 'another-owner' },
      { ...f.request, sourceRevisions: f.job.sourceRevisions },
      { ...f.request, securityRevision: 500 },
      { ...f.request, filters: { accountIds: [experienceId(9999)] } },
      { accountIds: [] },
      { accountIds: Array.from({ length: 51 }, (_, index) => experienceId(5000 + index)) },
    ])
      await expect(f.runtime.start('u1', 0, request)).rejects.toThrow();
    expect(f.commands).toHaveLength(0);
    expect(f.save).not.toHaveBeenCalled();
    expect(f.dispatch).not.toHaveBeenCalled();
  });

  it('matches canonical account names and proves a name-filtered empty scope without reading facts', async () => {
    const f = setupCreation(2);
    for (const [index, friendlyName] of ['Daily checking', 'ＲＥＳＥＲＶＥ Savings'].entries()) {
      const key = f.key({ PK: 'FINANCE#SCOPE#OWNER#u1', SK: `ROW#accounts#${index}` });
      const row = f.rows.get(key)!;
      f.rows.set(key, { ...row, data: { ...(row.data as object), friendlyName } });
    }
    const matching = await f.runtime.start('u1', 0, {
      ...f.request,
      filters: { accountName: ' reserve ' },
    });
    expect(f.jobs.get(matching)?.partitions.map((partition) => partition.accountId)).toEqual([
      f.request.accountIds[1],
    ]);
    const empty = await f.runtime.start('u1', 0, {
      ...f.request,
      filters: { accountName: 'Absent synthetic account' },
    });
    expect(await f.runtime.status('u1', empty)).toMatchObject({
      items: [],
      rowsState: 'confirmed-empty',
      aggregateState: 'exact',
      totalCount: 0,
      coverage: { examined: 0, scopeComplete: true },
    });
    expect(f.dispatch).toHaveBeenCalledOnce();
    for (const command of f.commands)
      if (command instanceof QueryCommand)
        expect(command.input.ExpressionAttributeValues?.[':prefix']).toBe('GROUP#');
    f.rows.set(f.key({ PK: 'FINANCE#SCOPE#OWNER#u1', SK: 'META' }), { revision: 2 });
    await expect(f.runtime.status('u1', empty)).rejects.toThrow(/source|authorization/i);
  });

  it('requires a current delivery grant and security revision even when creating an empty result', async () => {
    const f = setupCreation(1);
    const request = { ...f.request, filters: { accountName: 'No match' } };
    f.visit.mockResolvedValue(false);
    await expect(f.runtime.start('u1', 0, request)).rejects.toThrow(/unlock|access/i);
    f.visit.mockResolvedValue(true);
    f.rows.set(f.key({ PK: 'USER#u1', SK: 'FINANCE_SECURITY' }), { revision: 2 });
    await expect(f.runtime.start('u1', 0, request)).rejects.toThrow(/revision|access/i);
    expect(f.save).not.toHaveBeenCalled();
    expect(f.dispatch).not.toHaveBeenCalled();
  });

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
    const preference = f.commands.find(
      (c) => c instanceof GetCommand && c.input.Key?.SK === 'FINANCE_SECURITY',
    ) as GetCommand;
    expect(preference.input).toMatchObject({
      ProjectionExpression: 'PK, #revision',
      ExpressionAttributeNames: { '#revision': 'revision' },
    });
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
