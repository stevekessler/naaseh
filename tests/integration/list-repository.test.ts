import { describe, expect, it } from 'vitest';
import { createListItem, totalMinor } from '@naaseh/domain';

describe('list item amount integration', () => {
  it('includes initial costs and credits in the immediate total', () => {
    const listId = '01J00000000000000000000001';
    const values = [
      createListItem(listId, { name: 'Cost', amountMinor: -400 }, 'owner'),
      createListItem(listId, { name: 'Credit', amountMinor: 150 }, 'owner'),
    ];
    expect(totalMinor(values.map((item) => item.directorySnapshot.amountMinor))).toBe(-250);
  });
});
