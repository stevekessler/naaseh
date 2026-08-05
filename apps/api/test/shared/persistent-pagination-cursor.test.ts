import { describe, expect, it } from 'vitest';
import {
  createPaginationCursorCodec,
  type PersistedCursorRecord,
  type PersistedCursorRepository,
} from '../../src/shared/persistent-pagination-cursor.js';
import {
  createPaginationCursorPayload,
  PaginationCursorError,
} from '../../src/shared/pagination-cursor.js';

function memoryRepository() {
  const records = new Map<string, PersistedCursorRecord>();
  const repository: PersistedCursorRepository = {
    async put(record) {
      records.set(`${record.actorId}:${record.cursorId}`, record);
    },
    async get(actorId, cursorId) {
      return records.get(`${actorId}:${cursorId}`);
    },
    async delete(actorId, cursorId) {
      records.delete(`${actorId}:${cursorId}`);
    },
  };
  return { repository, records };
}

const context = (now = 1_000) => ({
  actorId: 'user-a',
  accessEpoch: 3,
  endpoint: 'archive',
  scope: 'overall:overall',
  orderBy: 'source',
  filters: { lifecycle: 'archived', urgencies: ['critical'] },
  sourceEpochs: { owner: 4, public: 8, group: 12 },
  now,
});

describe('persisted pagination cursor codec', () => {
  it('keeps a single-source cursor inline', async () => {
    const { repository, records } = memoryRepository();
    const codec = createPaginationCursorCodec('test-secret', repository);
    const payload = createPaginationCursorPayload(
      {
        ...context(),
        sourceEpochs: { owner: 4 },
      },
      2,
    );

    const token = await codec.encode(payload);

    expect(token).toMatch(/^v1\./);
    expect(records.size).toBe(0);
    await expect(codec.decode(token, 'user-a', 1_001)).resolves.toEqual(payload);
  });

  it('stores encrypted multi-source state and returns only an opaque reference', async () => {
    const { repository, records } = memoryRepository();
    const codec = createPaginationCursorCodec('test-secret', repository);
    const payload = createPaginationCursorPayload(context(), 0, 15 * 60_000, {
      projectedWork: {
        partitionIndex: 2,
        pendingPointers: Array.from({ length: 120 }, (_, index) => ({
          workId: `private-work-${index}`,
          workType: 'task',
        })),
      },
    });

    const token = await codec.encode(payload);

    expect(token).toMatch(/^r1\./);
    expect(token).not.toContain('user-a');
    expect(token).not.toContain('private-work');
    expect(records.size).toBe(1);
    expect([...records.values()][0]?.encryptedState).not.toContain('private-work');
    await expect(codec.decode(token, 'user-a', 1_001)).resolves.toEqual(payload);
  });

  it('rejects cross-user, expired, and tampered references', async () => {
    const { repository } = memoryRepository();
    const codec = createPaginationCursorCodec('test-secret', repository);
    const payload = createPaginationCursorPayload(context(), 0, 100);
    const token = await codec.encode(payload);

    await expect(codec.decode(token, 'user-b', 1_001)).rejects.toMatchObject({
      status: 400,
      code: 'invalid_cursor',
    } satisfies Partial<PaginationCursorError>);
    await expect(codec.decode(token, 'user-a', 1_101)).rejects.toMatchObject({
      status: 410,
      code: 'cursor_expired',
    } satisfies Partial<PaginationCursorError>);
    await expect(codec.decode(`${token.slice(0, -1)}x`, 'user-a', 1_001)).rejects.toMatchObject({
      status: 400,
      code: 'invalid_cursor',
    });
  });
});
