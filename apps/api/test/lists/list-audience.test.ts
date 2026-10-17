import { describe, expect, it } from 'vitest';
import {
  completeListAudienceTransitionChanges,
  listItemAudienceTransitionChanges,
} from '../../src/lists/list-audience.js';

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
  it('moves the parent and every existing child to the newly selected group', () => {
    const previous = {
      id: '01J00000000000000000000001',
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
    const items = ['one', 'two'].map((id) => ({
      id,
      version: 1,
      updatedAt: '2026-10-16T12:00:00.000Z',
      status: 'open',
    }));
    const changes = completeListAudienceTransitionChanges(previous, next, items);
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: 'list', audience: 'GROUP#family' }),
        expect.objectContaining({
          entityType: 'listItem',
          entityId: 'one',
          audience: 'GROUP#family',
        }),
        expect.objectContaining({
          entityType: 'listItem',
          entityId: 'two',
          audience: 'GROUP#family',
        }),
      ]),
    );
    expect(
      changes.filter(
        (change) => change.audience === 'OWNER#owner' && change.operation === 'tombstone',
      ),
    ).toHaveLength(3);
  });
});
