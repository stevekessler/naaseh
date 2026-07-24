import { describe, expect, it } from 'vitest';
import { createList } from '@naaseh/domain';
import { listAudienceChanges } from '../../apps/api/src/lists/list-audience.js';
describe('list audience transitions', () => {
  it('tombstones old visibility and upserts owner/group/admin without duplicates', () => {
    const global = createList({ name: 'Shared' }, 'owner');
    const grouped = {
      ...global,
      groupId: 'family',
      version: 2,
      updatedAt: '2026-01-01T00:00:01.000Z',
    };
    const changes = listAudienceChanges(global, grouped);
    expect(
      changes.some((change) => change.audience === 'PUBLIC' && change.operation === 'tombstone'),
    ).toBe(true);
    expect(new Set(changes.map((change) => change.audience)).size).toBe(changes.length);
    expect(changes.some((change) => change.audience === 'GROUP#family')).toBe(true);
    expect(changes.some((change) => change.audience.startsWith('ADMIN#'))).toBe(true);
  });
});
