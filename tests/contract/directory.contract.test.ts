import { describe, expect, it } from 'vitest';
import {
  directoryItemCreateSchema,
  directoryItemPatchSchema,
  directoryItemResponseSchema,
  listItemPatchSchema,
} from '@naaseh/contracts';
import { createDirectoryItem } from '../../apps/api/src/directory/directory-service.js';

describe('directory contracts', () => {
  it('accepts signed values and all-user lifecycle patches', () => {
    expect(directoryItemCreateSchema.parse({ name: 'Milk', amountMinor: -499 })).toMatchObject({
      currency: 'USD',
    });
    expect(
      directoryItemPatchSchema.parse({ name: 'Oat milk', amountMinor: 250, status: 'active' }),
    ).toMatchObject({ amountMinor: 250 });
    expect(
      directoryItemResponseSchema.parse(
        createDirectoryItem({ name: 'Milk', amountMinor: null, currency: 'USD' }, 'user'),
      ).version,
    ).toBe(1);
  });

  it('uses an explicit semantic reset payload rather than ambiguous null overrides', () => {
    expect(listItemPatchSchema.parse({ nameOverride: null, valueOverride: null })).toEqual({
      nameOverride: null,
      valueOverride: null,
    });
    expect(() => directoryItemPatchSchema.parse({ unexpected: true })).toThrow();
  });
});
