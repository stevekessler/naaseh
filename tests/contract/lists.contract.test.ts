import { describe, expect, it } from 'vitest';
import {
  completionRequestSchema,
  listCreateSchema,
  listDetailResponseSchema,
  listItemCreateSchema,
  listItemPatchSchema,
  listPatchSchema,
} from '@naaseh/contracts';
import { createList, createListItem } from '@naaseh/domain';

describe('list HTTP contracts', () => {
  it('validates create, patch, ordering, value override, and completion bodies', () => {
    expect(listCreateSchema.parse({ name: 'Groceries' })).toEqual({ name: 'Groceries' });
    expect(listPatchSchema.parse({ locked: true })).toEqual({ locked: true });
    expect(listItemCreateSchema.parse({ name: 'Milk', amountMinor: -499 })).toMatchObject({
      amountMinor: -499,
    });
    expect(
      listItemPatchSchema.parse({
        orderKey: '000000000020',
        valueOverride: { kind: 'amount', amountMinor: 250 },
      }),
    ).toMatchObject({ orderKey: '000000000020' });
    expect(completionRequestSchema.parse({ completed: true })).toEqual({ completed: true });
  });

  it('rejects empty patches and validates the complete response shape', () => {
    expect(() => listPatchSchema.parse({})).toThrow();
    const list = createList({ name: 'Groceries' }, 'owner');
    const item = createListItem(list.id, { name: 'Milk' }, 'owner');
    expect(listDetailResponseSchema.parse({ list, items: [item] })).toMatchObject({
      list: { id: list.id },
      items: [{ id: item.id }],
    });
  });
});
