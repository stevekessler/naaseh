import { describe, expect, it } from 'vitest';
import {
  createDirectoryItem,
  updateDirectoryItem,
} from '../../apps/api/src/directory/directory-service.js';

describe('directory optimistic lifecycle', () => {
  it('allows different active users to edit sequential versions and archive', () => {
    const created = createDirectoryItem(
      { name: 'Milk', amountMinor: -499, currency: 'USD' },
      'alice',
    );
    const edited = updateDirectoryItem(created, { name: 'Oat milk' }, 'bob');
    const archived = updateDirectoryItem(edited, { status: 'archived' }, 'carol');
    expect(edited).toMatchObject({ updatedBy: 'bob', version: 2 });
    expect(archived).toMatchObject({ status: 'archived', version: 3 });
    expect(() => updateDirectoryItem(archived, { name: 'stale edit' }, 'alice')).toThrow();
  });

  it('returns the canonical unchanged value for replay at the service boundary', () => {
    const created = createDirectoryItem(
      { name: 'Bread', amountMinor: null, currency: 'USD' },
      'alice',
    );
    expect(created).toEqual(created);
  });
});
