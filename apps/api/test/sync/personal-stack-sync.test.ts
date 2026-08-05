import { describe, expect, it } from 'vitest';
import { pushRequestSchema } from '@naaseh/contracts';
import { createPersonalStackService } from '../../src/ranking/stack-service.js';
import {
  dispatchPersonalStackSyncMutation,
  serializeSharedWorkChange,
} from '../../src/sync/sync-service.js';
import {
  assertFeedChangePrivacy,
  deserializeAudienceFeedItems,
  type PersonalStackFeedChange,
} from '../../src/sync/change-feed-repository.js';

const mutationId = '01K00000000000000000000001';
const operationId = '01K00000000000000000000002';
const projectId = '01K00000000000000000000003';
const first = {
  workType: 'task' as const,
  workId: '01K00000000000000000000101',
  membershipEpoch: 'epoch-1',
};
const second = {
  workType: 'task' as const,
  workId: '01K00000000000000000000102',
  membershipEpoch: 'epoch-2',
};

const stackMutation = (scope: 'overall' | 'project' = 'overall') => ({
  id: mutationId,
  entityId: scope === 'project' ? projectId : operationId,
  entityType: 'personalStackOperation' as const,
  operation: 'reorder' as const,
  baseVersion: 0,
  payload: {
    scope,
    baseVersion: 0,
    move: { kind: 'simple_move' as const, movedWork: second, afterWork: first },
  },
  createdAt: '2026-08-05T12:00:00.000Z',
  attempts: 0,
});

describe('contract-v4 personal stack synchronization', () => {
  it('routes stack pushes only through contract version 4', () => {
    expect(
      pushRequestSchema.safeParse({ contractVersion: 4, mutations: [stackMutation()] }).success,
    ).toBe(true);
    expect(
      pushRequestSchema.safeParse({ contractVersion: 3, mutations: [stackMutation()] }).success,
    ).toBe(false);
  });

  it('routes overall and Project operations through the owner ranking service', async () => {
    const observed: unknown[] = [];
    const service = {
      async read() {
        return { version: 0, items: [] };
      },
      async reorder(input: unknown) {
        observed.push(input);
        return { status: 'pending_compaction' as const, stackVersion: 4 };
      },
    };
    await dispatchPersonalStackSyncMutation({
      actorId: 'owner-a',
      sourceClientId: 'browser-a',
      mutation: stackMutation(),
      service,
    });
    const projectResult = await dispatchPersonalStackSyncMutation({
      actorId: 'owner-a',
      sourceClientId: 'browser-a',
      mutation: stackMutation('project'),
      service,
    });

    expect(observed).toEqual([
      expect.objectContaining({
        actorId: 'owner-a',
        scope: { userId: 'owner-a', scopeType: 'overall' },
        mutationId,
      }),
      expect.objectContaining({
        actorId: 'owner-a',
        scope: { userId: 'owner-a', scopeType: 'project', scopeId: projectId },
        mutationId,
      }),
    ]);
    expect(projectResult).toEqual({
      mutationId,
      operationId: projectId,
      status: 'applied',
      version: 4,
    });
  });

  it('replays duplicate mutation IDs without committing twice', async () => {
    let commits = 0;
    const scopes = new Map<string, { version: number; order: (typeof first)[] }>();
    const receipts = new Map<string, { status: 'applied'; stackVersion: number }>();
    const service = createPersonalStackService({
      repository: {
        async loadScope() {
          return scopes.get('overall');
        },
        async findMutation(userId, id) {
          return receipts.get(`${userId}:${id}`);
        },
        async commit(input) {
          commits += 1;
          scopes.set('overall', input.next);
          receipts.set(`${input.scope.userId}:${input.mutationId}`, {
            status: 'applied',
            stackVersion: input.next.version,
          });
          return true;
        },
      },
      listEligibleWork: async () => [
        { ...first, urgency: 'critical' },
        { ...second, urgency: 'extra_low' },
      ],
    });
    const input = {
      actorId: 'owner-a',
      sourceClientId: 'browser-a',
      mutation: stackMutation(),
      service,
    };
    const firstResult = await dispatchPersonalStackSyncMutation(input);
    const replay = await dispatchPersonalStackSyncMutation(input);

    expect(replay).toEqual(firstResult);
    expect(commits).toBe(1);
  });

  it('normalizes legacy owner records but suppresses stack operations from shared feeds', () => {
    const stored = [
      {
        SK: 'CHANGE#00000000000000000007',
        data: { entityType: 'personalStackOperation', operationId },
      },
    ];
    const owner = deserializeAudienceFeedItems('OWNER#owner-a', stored);
    expect(owner).toEqual([
      {
        audience: 'OWNER#owner-a',
        sequence: 7,
        entityId: operationId,
        entityType: 'personalStackOperation',
        operation: 'upsert',
        payload: { operationId },
      },
    ]);
    expect(deserializeAudienceFeedItems('PUBLIC', stored)).toEqual([]);
    expect(deserializeAudienceFeedItems('GROUP#group-a', stored)).toEqual([]);
  });

  it('rejects rank fields in owner stack feed payloads and shared work changes', () => {
    const unsafe = {
      audience: 'OWNER#owner-a',
      sequence: 1,
      entityId: operationId,
      entityType: 'personalStackOperation',
      operation: 'upsert',
      payload: { operationId, overallRank: 1 },
    } as unknown as PersonalStackFeedChange;
    expect(() => assertFeedChangePrivacy(unsafe)).toThrow(/rank/iu);
    expect(() =>
      serializeSharedWorkChange({
        audience: 'PUBLIC',
        sequence: 1,
        entityId: first.workId,
        entityType: 'task',
        operation: 'upsert',
        payload: { overallRank: 1 },
        changedAt: '2026-08-05T12:00:00.000Z',
      }),
    ).toThrow(/rank|position/iu);
  });
});
