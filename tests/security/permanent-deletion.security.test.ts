import { describe, expect, it } from 'vitest';
import { canRequestPermanentDeletion } from '../../apps/api/src/deletion/deletion-service.js';

describe('permanent deletion security', () => {
  it('is owner-only and online-only', () => {
    expect(canRequestPermanentDeletion('owner', 'owner', true)).toBe(true);
    expect(canRequestPermanentDeletion('other', 'owner', true)).toBe(false);
    expect(canRequestPermanentDeletion('owner', 'owner', false)).toBe(false);
  });
});
