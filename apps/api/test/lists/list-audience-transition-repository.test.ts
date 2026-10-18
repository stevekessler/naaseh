import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  send: vi.fn(async () => ({})),
  findListItem: vi.fn(),
}));

vi.mock('../../src/shared/dynamodb.js', () => ({
  dynamodb: { send: fixtures.send },
  tableName: 'test-table',
}));
vi.mock('../../src/lists/list-repository.js', () => ({
  findListItem: fixtures.findListItem,
}));
vi.mock('../../src/sync/change-feed-repository.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../src/sync/change-feed-repository.js')>();
  return {
    ...original,
    prepareAudienceChanges: vi.fn(async (changes: Array<Record<string, unknown>>) => {
      const sequences = new Map<string, number>();
      return changes.map((change) => {
        const audience = String(change.audience);
        const expectedSequence = sequences.get(audience) ?? 0;
        sequences.set(audience, expectedSequence + 1);
        return {
          expectedSequence,
          change: { ...change, sequence: expectedSequence + 1 },
        };
      });
    }),
  };
});

import {
  createListAudienceTransition,
  listAudienceTransitionLimits,
  resumeListAudienceTransition,
} from '../../src/lists/list-audience-transition-repository.js';

const previous = {
  id: 'list-1',
  ownerId: 'owner',
  locked: true,
  version: 1,
  updatedAt: '2026-10-16T12:00:00.000Z',
} as never;
const next = {
  ...previous,
  locked: false,
  groupId: 'family',
  version: 2,
  updatedAt: '2026-10-17T12:00:00.000Z',
} as never;

describe('resumable list audience transitions', () => {
  beforeEach(() => {
    fixtures.send.mockClear();
    fixtures.findListItem.mockReset();
  });

  it('keeps every child-feed transaction below the DynamoDB 100-operation limit', async () => {
    const items = Array.from({ length: 81 }, (_, index) => ({
      id: `item-${index}`,
      listId: 'list-1',
      version: 1,
      updatedAt: '2026-10-16T12:00:00.000Z',
      status: 'open',
    })) as never[];
    fixtures.findListItem.mockImplementation(async (id: string) =>
      items.find((item: any) => item.id === id),
    );
    const { transition } = createListAudienceTransition(
      previous,
      next,
      'owner',
      'mutation-1',
      items,
    );

    const result = await resumeListAudienceTransition(transition);

    expect(result.status).toBe('complete');
    expect(result.nextIndex).toBe(81);
    expect(listAudienceTransitionLimits.batchSize).toBe(40);
    const transactions = fixtures.send.mock.calls.map(
      ([command]) => (command as TransactWriteCommand).input.TransactItems ?? [],
    );
    expect(transactions).toHaveLength(4);
    expect(Math.max(...transactions.map((items) => items.length))).toBeLessThanOrEqual(100);
  });

  it('stores resumable child identity and version checkpoints without protected item text', () => {
    const { transition, records } = createListAudienceTransition(
      previous,
      next,
      'owner',
      'mutation-2',
      [
        {
          id: 'item-1',
          version: 7,
          updatedAt: '2026-10-17T12:00:00.000Z',
          status: 'open',
          nameOverride: 'private text',
        } as never,
      ],
    );

    expect(transition.items).toEqual([
      { id: 'item-1', version: 7, updatedAt: '2026-10-17T12:00:00.000Z' },
    ]);
    expect(JSON.stringify(records)).not.toContain('private text');
  });
});
