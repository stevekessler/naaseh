import { describe, expect, it, vi } from 'vitest';
import { createHash, createDecipheriv, createCipheriv, randomBytes } from 'node:crypto';
import { FinanceCacheProofService } from '../../apps/api/src/finance/cache-proof.js';
import { FinanceSyncSourceGuard } from '../../apps/api/src/finance/sync-source-guard.js';
import { FinanceUnitOfWork, financeLocatorKey } from '../../apps/api/src/finance/unit-of-work.js';
import { financePersistenceFixture } from '../fixtures/finance/persistence.js';

function setup() {
  const f = financePersistenceFixture();
  const owner = 'FINANCE#SCOPE#OWNER#owner',
    group = 'FINANCE#SCOPE#GROUP#shared';
  let allowed = true,
    member = true,
    now = 1000000;
  let task = { ownerId: 'owner', visibility: 'private' as 'private' | 'public', version: 1 };
  const membership = vi.fn(async (groupId: string, userId: string) =>
    member ? { userId, groupId, status: 'active', role: 'member', version: 1 } : undefined,
  );
  const taskRead = vi.fn(async () => task);
  const add = (collection: string, id: string, data: Record<string, unknown>, PK = owner) => {
    const key = { PK, SK: `ROW#${collection}#${id}` };
    f.rows.set(f.key(key), { ...key, collection, entryKey: id, data: { id, version: 1, ...data } });
    f.rows.set(f.key(financeLocatorKey(collection, id)), {
      ...financeLocatorKey(collection, id),
      storageKey: key,
    });
    f.rows.set(f.key({ PK, SK: 'META' }), { PK, SK: 'META', revision: 1 });
  };
  add('accounts', 'account', { scope: { type: 'owner', ownerId: 'owner' }, status: 'active' });
  const work = () => new FinanceUnitOfWork(f.persistence, 'table');
  const guard = (role: 'user' | 'admin' = 'user') =>
    new FinanceSyncSourceGuard({ userId: 'owner', role, work, membership, task: taskRead });
  const authorize = vi.fn(async () => {
    if (!allowed) throw new Error('Finance locked');
  });
  const service = (
    userId = 'owner',
    secret = 'test-secret-'.repeat(8),
    role: 'user' | 'admin' = 'user',
  ) =>
    new FinanceCacheProofService({
      userId,
      role,
      secret,
      work,
      membership,
      task: taskRead,
      authorize,
      now: () => now,
    });
  const deliver = async (
    g: FinanceSyncSourceGuard,
    entityType = 'financeAccount',
    entityId = 'account',
  ) => {
    const payload = [...f.rows.values()].find(
      (row) => row.collection && row.entryKey === entityId,
    )?.data;
    expect(
      await g.canDeliver({
        entityType,
        entityId,
        payload,
        audience: 'OWNER#owner',
        sequence: 1,
        version: 1,
        operation: 'upsert',
        changedAt: '2026-11-07T00:00:00Z',
      } as never),
    ).toBe(true);
  };
  return {
    ...f,
    owner,
    group,
    add,
    guard,
    service,
    deliver,
    authorize,
    membership,
    lock: () => {
      allowed = false;
    },
    revoke: () => {
      member = false;
    },
    task: (value: typeof task) => {
      task = value;
    },
    advance: () => {
      now += 15 * 60000;
    },
  };
}
describe('opaque Finance cached-source proofs', () => {
  it('requires refresh for an authentic older proof that lacks catalogue withdrawal semantics', async () => {
    const f = setup(),
      token = await f.service().issue(f.guard());
    const [, nonce, encoded, signature] = token.split('.');
    const key = createHash('sha256')
      .update(`naaseh-finance-cache-proof-v1:${'test-secret-'.repeat(8)}`)
      .digest();
    const aad = Buffer.from('finance-cache-proof:v1:owner');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce!, 'base64url'));
    decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(signature!, 'base64url'));
    const claims = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(encoded!, 'base64url')),
        decipher.final(),
      ]).toString('utf8'),
    );
    delete claims.semantics;
    claims.snapshot.scopes = [];
    const plaintext = Buffer.from(JSON.stringify(claims));
    const padded = Buffer.alloc(Math.ceil((plaintext.length + 1) / 256) * 256, 32);
    plaintext.copy(padded);
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad);
    const body = Buffer.concat([cipher.update(padded), cipher.final()]);
    const old = `fc1.${iv.toString('base64url')}.${body.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
    await expect(f.service().verify(old)).rejects.toThrow(/refresh/i);
    await expect(f.service().issue(f.guard(), old)).rejects.toThrow(/refresh/i);
  });
  it('invalidates even an empty cached snapshot after a catalogue withdrawal, while allowing content edits', async () => {
    const f = setup(),
      key = { PK: 'FINANCE#CATALOG', SK: 'META' };
    const token = await f.service().issue(f.guard());
    f.rows.set(f.key(key), { ...key, revision: 1 });
    await expect(f.service().verify(token)).resolves.toBeUndefined();
    f.rows.set(f.key(key), { ...key, revision: 2, financeAuthorizationRevision: 1 });
    await expect(f.service().verify(token)).rejects.toThrow(/refresh/i);
    await expect(f.service().issue(f.guard(), token)).rejects.toThrow(/refresh/i);
  });
  it('does not bless a catalogue body read before a withdrawal with a newer catalogue revision', async () => {
    const f = setup();
    f.add('categories', 'category', { name: 'Old category' }, 'FINANCE#CATALOG');
    const guard = f.guard();
    await f.deliver(guard, 'financeCategory', 'category');
    const key = { PK: 'FINANCE#CATALOG', SK: 'META' };
    f.rows.set(f.key(key), { ...key, revision: 2, financeAuthorizationRevision: 1 });
    await expect(f.service().issue(guard)).rejects.toThrow(/changed|refresh/i);
  });
  it('combines independent snapshot proofs without dropping any source dependency', async () => {
    const f = setup(),
      ownerGuard = f.guard();
    await f.deliver(ownerGuard);
    const ownerProof = await f.service().issue(ownerGuard);
    f.add(
      'accounts',
      'group-account',
      { scope: { type: 'group', groupId: 'shared' }, status: 'active' },
      f.group,
    );
    const groupGuard = f.guard();
    await f.deliver(groupGuard, 'financeAccount', 'group-account');
    const groupProof = await f.service().issue(groupGuard);
    const merged = await f.service().issue(f.guard(), [ownerProof, groupProof]);
    await expect(f.service().verify(merged)).resolves.toBeUndefined();
    f.revoke();
    await expect(f.service().verify(merged)).rejects.toThrow(/refresh/i);
  });
  it('rejects contradictory generations, empty/oversized arrays and mixed-user proof bundles', async () => {
    const f = setup(),
      guard = f.guard();
    await f.deliver(guard);
    const before = await f.service().issue(guard);
    f.rows.get(f.key({ PK: f.owner, SK: 'META' }))!.financeAuthorizationRevision = 1;
    const nextGuard = f.guard();
    await f.deliver(nextGuard);
    const after = await f.service().issue(nextGuard);
    await expect(f.service().issue(f.guard(), [before, after])).rejects.toThrow(/refresh/i);
    await expect(f.service().issue(f.guard(), [])).rejects.toThrow(/refresh/i);
    await expect(f.service().issue(f.guard(), Array(65).fill(after))).rejects.toThrow(/refresh/i);
    await expect(
      f.service('someone-else').issue(
        {
          cacheAuthorizationSnapshot: async () => ({
            userId: 'someone-else',
            scopes: [],
            members: [],
            tasks: [],
          }),
        },
        [after],
      ),
    ).rejects.toThrow(/refresh/i);
  });

  it('revalidates administrator owner/member proofs and still requires the session/PIN gate', async () => {
    const f = setup(),
      guard = f.guard('admin'),
      service = f.service('owner', 'test-secret-'.repeat(8), 'admin');
    await f.deliver(guard);
    f.add('budgets', 'budget', { groupId: 'shared', status: 'active' }, f.group);
    await f.deliver(guard, 'financeBudget', 'budget');
    const token = await service.issue(guard);
    await expect(service.verify(token)).resolves.toBeUndefined();
    f.revoke();
    await expect(service.verify(token)).rejects.toThrow(/refresh/i);
    f.lock();
    const read = vi.spyOn(f.persistence, 'get');
    await expect(service.verify(token)).rejects.toThrow(/locked/i);
    expect(read).not.toHaveBeenCalled();
  });
  it('binds encrypted evidence to its user, secret and expiry without replacing session/PIN authorization', async () => {
    const f = setup(),
      g = f.guard();
    await f.deliver(g);
    const token = await f.service().issue(g);
    expect(token).not.toContain('FINANCE');
    expect(token).not.toContain('owner');
    await expect(f.service().verify(token)).resolves.toBeUndefined();
    await expect(f.service('other').verify(token)).rejects.toThrow(/refresh/i);
    await expect(f.service('owner', 'different-secret-'.repeat(8)).verify(token)).rejects.toThrow(
      /refresh/i,
    );
    await expect(
      f.service('owner', 'test-secret-'.repeat(8), 'admin').verify(token),
    ).resolves.toBeUndefined();
    f.authorize.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Finance locked'));
    await expect(f.service().verify(token)).rejects.toThrow(/locked/i);
    await expect(f.service().verify(token.slice(0, -8) + 'AAAAAAAA')).rejects.toThrow(/refresh/i);
    await expect(f.service().verify('x'.repeat(100000))).rejects.toThrow(/refresh/i);
    f.advance();
    await expect(f.service().verify(token)).rejects.toThrow(/refresh/i);
    f.lock();
    const read = vi.spyOn(f.persistence, 'get');
    await expect(f.service().verify(token)).rejects.toThrow(/locked/i);
    expect(read).not.toHaveBeenCalled();
  });
  it('ignores ordinary content revisions but rejects permission changes or missing scope lineage', async () => {
    const f = setup(),
      g = f.guard();
    await f.deliver(g);
    const token = await f.service().issue(g),
      key = { PK: f.owner, SK: 'META' };
    f.rows.set(f.key(key), { ...key, revision: 2 });
    await expect(f.service().verify(token)).resolves.toBeUndefined();
    f.rows.set(f.key(key), { ...key, revision: 3, financeAuthorizationRevision: null });
    await expect(f.service().verify(token)).rejects.toThrow(/refresh/i);
    f.rows.set(f.key(key), { ...key, revision: 3, financeAuthorizationRevision: 1 });
    await expect(f.service().verify(token)).rejects.toThrow(/refresh/i);
    f.rows.delete(f.key(key));
    await expect(f.service().verify(token)).rejects.toThrow(/refresh/i);
  });
  it('checks canonical membership and task visibility again, including changes during verification', async () => {
    const f = setup();
    f.add('budgets', 'budget', { groupId: 'shared', status: 'active' }, f.group);
    f.add(
      'budgetItems',
      'item',
      { budgetId: 'budget', relatedAccountIds: [], status: 'active' },
      f.group,
    );
    f.add(
      'financialTaskLinks',
      'link',
      { budgetId: 'budget', budgetItemId: 'item', taskId: 'task' },
      f.group,
    );
    const g = f.guard();
    await f.deliver(g, 'financeTaskLink', 'link');
    const token = await f.service().issue(g);
    f.task({ ownerId: 'owner', visibility: 'private', version: 2 });
    await expect(f.service().verify(token)).resolves.toBeUndefined();
    f.task({ ownerId: 'other', visibility: 'private', version: 3 });
    await expect(f.service().verify(token)).rejects.toThrow(/refresh/i);
    f.task({ ownerId: 'owner', visibility: 'private', version: 4 });
    const read = f.persistence.get;
    let calls = 0;
    f.persistence.get = async (key) => {
      const row = await read(key);
      if (++calls === 1) f.revoke();
      return row;
    };
    await expect(f.service().verify(token)).rejects.toThrow(/refresh/i);
  });
  it('does not read denied private source bodies or issue evidence from an obsolete delivery snapshot', async () => {
    const f = setup();
    f.add(
      'accounts',
      'hidden',
      { scope: { type: 'owner', ownerId: 'other' }, status: 'active' },
      'FINANCE#SCOPE#OWNER#other',
    );
    const read = vi.spyOn(f.persistence, 'get'),
      g = f.guard();
    expect(await g.canDeliver({ entityType: 'financeAccount', entityId: 'hidden' } as never)).toBe(
      false,
    );
    expect(read.mock.calls.some(([key]) => key.PK === 'FINANCE#SCOPE#OWNER#other')).toBe(false);
    await f.deliver(g);
    const previous = await f.service().issue(g);
    f.add('budgets', 'next-budget', { groupId: 'shared', status: 'active' }, f.group);
    const next = f.guard();
    await f.deliver(next, 'financeBudget', 'next-budget');
    f.authorize.mockClear();
    const combined = await f.service().issue(next, previous);
    expect(f.authorize).toHaveBeenCalledTimes(2);
    await expect(f.service().verify(combined)).resolves.toBeUndefined();
    const key = { PK: f.owner, SK: 'META' };
    f.rows.set(f.key(key), { ...key, revision: 2, financeAuthorizationRevision: 1 });
    await expect(f.service().issue(g)).rejects.toThrow(/changed|refresh/i);
    await expect(f.service().verify(combined)).rejects.toThrow(/refresh/i);
    await expect(f.service().issue(f.guard(), previous)).rejects.toThrow(/refresh/i);
  });
});
