import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createList } from '@naaseh/domain';

const store = vi.hoisted(() => ({
  commitEntity: vi.fn(async () => undefined),
  getRecord: vi.fn(),
}));

vi.mock('../../src/shared/store.js', () => store);

import { saveList } from '../../src/lists/list-repository.js';
import { createOwnedList, updateOwnedList } from '../../src/lists/list-service.js';

const now = new Date('2026-08-05T12:00:00.000Z');

describe('List urgency persistence', () => {
  beforeEach(() => {
    store.commitEntity.mockClear();
    store.getRecord.mockReset();
  });

  it('creates default and explicit urgency and preserves owner-only updates', () => {
    expect(createOwnedList('Default', 'owner', now).urgency).toBe('medium');
    expect(createOwnedList('Critical', 'owner', now, undefined, 'critical').urgency).toBe(
      'critical',
    );

    const current = createList({ name: 'Owned' }, 'owner', now);
    expect(() => updateOwnedList(current, { urgency: 'high' }, 'intruder')).toThrow(
      'Only the owner',
    );
    expect(updateOwnedList(current, { urgency: 'high' }, 'owner').urgency).toBe('high');
  });

  it('persists categorical urgency in safe revision before/after values', async () => {
    const current = createList({ name: 'Owned' }, 'owner', now);
    const next = updateOwnedList(
      current,
      { urgency: 'high' },
      'owner',
      new Date('2026-08-05T12:01:00.000Z'),
    );
    store.getRecord.mockResolvedValue({ data: current });

    await saveList(next, 'owner', 'mutation-1', 'update', ['urgency'], current.version);

    expect(store.commitEntity).toHaveBeenCalledOnce();
    expect(store.commitEntity.mock.calls[0]?.[0].revision).toMatchObject({
      changedFields: ['urgency'],
      before: { urgency: 'medium' },
      after: { urgency: 'high' },
    });
    expect(store.commitEntity.mock.calls[0]?.[0].current.data).toMatchObject({ urgency: 'high' });
  });
});
