import { describe, expect, it } from 'vitest';
import { listItemAudienceTransitionChanges } from '../../src/lists/list-audience.js';

describe('list item audience transitions', () => {
  it('removes the source audience and publishes to the destination audience when moved', () => {
    const previous = {
      id: '01J00000000000000000000001',
      ownerId: 'owner',
      locked: false,
      groupId: 'family',
    } as never;
    const next = {
      id: '01J00000000000000000000002',
      ownerId: 'owner',
      locked: true,
    } as never;
    const item = {
      id: '01J00000000000000000000003',
      version: 2,
      updatedAt: '2026-10-16T12:00:00.000Z',
      status: 'open',
    };
    const changes = listItemAudienceTransitionChanges(previous, next, item, item);
    expect(changes).toContainEqual(
      expect.objectContaining({ audience: 'GROUP#family', operation: 'tombstone' }),
    );
    expect(changes).toContainEqual(
      expect.objectContaining({ audience: 'OWNER#owner', operation: 'upsert', payload: item }),
    );
  });
});
