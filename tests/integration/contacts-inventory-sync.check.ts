import { parseMutationHeaders } from '../../packages/contacts-inventory-contracts/src/api.js';
import {
  createFeatureTelemetry,
  featureOperation,
} from '../../apps/api/src/contacts-inventory/telemetry.js';
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb } from '../../apps/api/src/shared/dynamodb.js';
import { DynamoWorkspaceStore } from '../../apps/api/src/contacts-inventory/dynamo-store.js';
import { WorkspaceRepository } from '../../apps/api/src/contacts-inventory/repository.js';
import { changes } from '../../apps/api/src/contacts-inventory/sync.js';
import { MemoryWorkspaceStore } from '../fixtures/contacts-inventory-store.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handler } from '../../apps/api/src/contacts-inventory/handler.js';
import { contactsInventoryFixture as fixture } from '../fixtures/contacts-inventory.js';

const base = `/api/v1/contacts-inventory/releases/${fixture.releases[0]}`;

function request(
  method: string,
  path: string,
  actor?: { userId: string; role: 'user' | 'admin' },
  csrf = 'fixture-csrf',
): APIGatewayProxyEventV2 {
  return {
    rawPath: `${base}${path}`,
    headers: { origin: 'http://127.0.0.1:4173', 'x-csrf-token': csrf },
    requestContext: {
      http: { method },
      ...(actor ? { authorizer: { lambda: { ...actor, csrfToken: 'fixture-csrf' } } } : {}),
    },
  } as APIGatewayProxyEventV2;
}

describe('Contacts and Inventory API access boundary', () => {
  beforeEach(() => {
    vi.stubEnv('CONTACTS_INVENTORY_RELEASE', fixture.releases[0]);
    vi.stubEnv('CONTACTS_INVENTORY_WORKSPACE', fixture.workspace);
    vi.stubEnv('CONTACTS_INVENTORY_MEMBER_ONE', fixture.members[0]);
    vi.stubEnv('CONTACTS_INVENTORY_MEMBER_TWO', fixture.members[1]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('requires a session and keeps the same workspace access for both members', async () => {
    expect((await handler(request('GET', '/contacts'))).statusCode).toBe(401);
    for (const userId of fixture.members) {
      const response = await handler(request('GET', '/contacts', { userId, role: 'user' }));
      expect(response.statusCode).toBe(503);
      expect(response.headers?.['Cache-Control']).toBe('no-store');
    }
  });

  it('denies nonmembers and limits separate catalog admins to catalog writes', async () => {
    const admin = { userId: fixture.catalogAdmin, role: 'admin' as const };
    const outsider = { userId: fixture.outsider, role: 'user' as const };
    expect((await handler(request('GET', '/contacts', admin))).statusCode).toBe(403);
    expect((await handler(request('GET', '/items/known/image', outsider))).statusCode).toBe(403);
    expect((await handler(request('PUT', '/catalogs/locations/home', admin))).statusCode).toBe(503);
    expect(
      (
        await handler(
          request('PUT', '/catalogs/locations/home', { userId: fixture.members[0], role: 'user' }),
        )
      ).statusCode,
    ).toBe(403);
  });

  it('requires a matching CSRF token for mutations', async () => {
    const member = { userId: fixture.members[0], role: 'user' as const };
    expect((await handler(request('DELETE', '/items/known', member, 'invalid'))).statusCode).toBe(
      403,
    );
    expect((await handler(request('DELETE', '/items/known', member))).statusCode).toBe(503);
  });
});

describe('Contacts and Inventory persistence', () => {
  const contact = { kind: 'contact', id: 'b4d02419-80af-4a8f-b710-1a49e7ca3000' } as const;
  const [actor, otherActor] = fixture.members;
  const mutation = (number: number) =>
    `b4d02419-80af-4a8f-b710-1a49e7ca3${String(number).padStart(3, '0')}`;
  const create = (repo: WorkspaceRepository) =>
    repo.mutate({
      ...contact,
      actor,
      generation: 1,
      mutationId: mutation(1),
      action: 'create',
      fields: { firstName: 'Synthetic', lastName: 'Contact' },
    });

  function setup() {
    const store = new MemoryWorkspaceStore();
    return { store, repo: new WorkspaceRepository(store, () => '2026-11-17T20:00:00.000Z') };
  }

  it('scopes receipts to the actor and detects a changed request on replay', async () => {
    const { repo, store } = setup();
    await expect(create(repo)).resolves.toMatchObject({ revision: 1, replayed: false });
    await expect(create(repo)).resolves.toMatchObject({ revision: 1, replayed: true });
    await expect(
      repo.mutate({
        ...contact,
        actor,
        generation: 1,
        mutationId: mutation(1),
        action: 'create',
        fields: { firstName: 'Changed' },
      }),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
    await expect(
      repo.mutate({
        ...contact,
        actor: otherActor,
        generation: 1,
        mutationId: mutation(1),
        action: 'update',
        revision: 1,
        fields: { firstName: 'Edited' },
      }),
    ).resolves.toMatchObject({ revision: 2, replayed: false });
    expect(store.entries).toHaveLength(2);
  });

  it('pages metadata, resolves tombstones, and hides deleted fields in a receipt replay', async () => {
    const { repo, store } = setup();
    await create(repo);
    await repo.mutate({
      ...contact,
      actor: otherActor,
      generation: 1,
      mutationId: mutation(2),
      action: 'delete',
      revision: 1,
    });
    expect(store.ledger).toEqual([
      { ...contact, revision: 2, lastChangeSequence: 2, deleted: true, generation: 1 },
    ]);
    expect(await repo.read(contact)).toBeNull();
    const first = await changes(store, { generation: 1, sequence: 0 }, 1);
    expect(first).toEqual({
      nextCursor: { generation: 1, sequence: 1 },
      hasMore: true,
      highWater: 2,
      changes: [
        {
          entry: { ...contact, sequence: 1 },
          record: { ...contact, revision: 2, lastChangeSequence: 2, deleted: true },
        },
      ],
    });
    expect((await changes(store, first.nextCursor, 1, first.highWater)).hasMore).toBe(false);
    expect(await create(repo)).toEqual({
      ...contact,
      revision: 1,
      lastChangeSequence: 1,
      action: 'create',
      replayed: true,
      deleted: true,
    });
    expect(store.entries[0]).toEqual({ ...contact, sequence: 1 });
  });

  it('keeps a snapshot cursor scoped to its actor and rejects invalid header combinations', async () => {
    const { repo } = setup();
    const base = { 'x-workspace-generation': '1', 'idempotency-key': mutation(1) };
    expect(parseMutationHeaders({ ...base, 'if-none-match': '*' })).toEqual({
      mode: 'create',
      generation: 1,
      mutationId: mutation(1),
    });
    expect(parseMutationHeaders({ ...base, 'if-match': '"2"' })).toMatchObject({
      mode: 'update',
      revision: 2,
    });
    expect(parseMutationHeaders({ ...base, 'if-none-match': '*', 'if-match': '"2"' })).toBeNull();
    await create(repo);
    await repo.mutate({
      ...contact,
      id: mutation(88),
      actor,
      generation: 1,
      mutationId: mutation(2),
      action: 'create',
      fields: { firstName: 'Second synthetic contact' },
    });
    const { readWorkspace } = await import('../../apps/api/src/contacts-inventory/read-routes.js');
    const page = await readWorkspace(
      repo,
      actor,
      fixture.workspace,
      'contacts',
      { limit: '1' },
      base,
    );
    if (!page || !('nextCursor' in page) || !page.nextCursor)
      throw new Error('Expected a second page');
    const cursor = page.nextCursor;
    await expect(
      readWorkspace(repo, actor, fixture.workspace, 'contacts', { cursor }, base),
    ).resolves.toMatchObject({ nextCursor: null });
    await expect(
      readWorkspace(repo, otherActor, fixture.workspace, 'contacts', { cursor }, base),
    ).rejects.toMatchObject({ code: 'invalid_cursor' });
  });

  it('uses one revision winner and refuses mutations and cursors from before a restore', async () => {
    const { repo, store } = setup();
    await create(repo);
    const outcomes = await Promise.allSettled([
      repo.mutate({
        ...contact,
        actor,
        generation: 1,
        mutationId: mutation(2),
        action: 'update',
        revision: 1,
        fields: { firstName: 'Edited' },
      }),
      repo.mutate({
        ...contact,
        actor: otherActor,
        generation: 1,
        mutationId: mutation(3),
        action: 'delete',
        revision: 1,
      }),
    ]);
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find(({ status }) => status === 'rejected')).toMatchObject({
      reason: { code: 'revision_conflict' },
    });
    store.state.generation = 2;
    await expect(create(repo)).rejects.toMatchObject({ code: 'reset_required' });
    await expect(changes(store, { generation: 1, sequence: 0 }, 10)).rejects.toMatchObject({
      code: 'reset_required',
    });
  });
});

describe('Contacts and Inventory DynamoDB transaction', () => {
  it('writes the tombstone, cursor, receipt, change and retained ledger atomically', async () => {
    const store = new DynamoWorkspaceStore(fixture.workspace, 'feature-records', 'feature-ledger');
    const key = { kind: 'contact', id: 'b4d02419-80af-4a8f-b710-1a49e7ca3000' } as const;
    const send = vi
      .spyOn(dynamodb, 'send')
      .mockResolvedValueOnce({ Item: { generation: 1, sequence: 1 } } as never)
      .mockResolvedValueOnce({} as never)
      .mockResolvedValueOnce({
        Item: {
          value: {
            ...key,
            revision: 1,
            lastChangeSequence: 1,
            fields: { firstName: 'Synthetic' },
          },
        },
      } as never)
      .mockResolvedValueOnce({} as never);
    try {
      const repo = new WorkspaceRepository(store);
      await repo.mutate({
        ...key,
        actor: fixture.members[0],
        generation: 1,
        mutationId: 'b4d02419-80af-4a8f-b710-1a49e7ca3015',
        revision: 1,
        action: 'delete',
      });
      const reads = send.mock.calls
        .slice(0, 3)
        .map(([command]) => command as unknown as GetCommand);
      expect(reads.every(({ input }) => input.ConsistentRead)).toBe(true);
      const write = send.mock.calls[3]?.[0] as unknown as TransactWriteCommand;
      const items = write.input.TransactItems;
      expect(items).toHaveLength(5);
      expect(items?.[0]?.Put?.ConditionExpression).toBe('#g = :generation AND #s = :sequence');
      expect(items?.[1]?.Put?.Item?.value).toEqual({
        ...key,
        deleted: true,
        revision: 2,
        lastChangeSequence: 2,
      });
      expect(items?.[2]?.Put?.Item?.value).toEqual({ ...key, sequence: 2 });
      expect(items?.[4]?.Put).toMatchObject({
        TableName: 'feature-ledger',
        ConditionExpression: 'attribute_not_exists(pk)',
      });
    } finally {
      send.mockRestore();
    }
  });
});

describe('Contacts and Inventory telemetry', () => {
  it('emits only fixed operation names and aggregate metrics', () => {
    const received: string[] = [];
    const operation = featureOperation('contacts/synthetic-private-id');
    createFeatureTelemetry((entry) => received.push(entry))(operation, 'request-123', 503, 25);
    expect(received.map((entry) => JSON.parse(entry))).toEqual([
      expect.objectContaining({ operationType: 'contacts', status: 503, latencyMs: 25 }),
      expect.objectContaining({ ContactsInventoryLatency: 25 }),
      expect.objectContaining({ ContactsInventoryRequestFailures: 1 }),
    ]);
    expect(received.join()).not.toContain('synthetic-private-id');
  });
});
