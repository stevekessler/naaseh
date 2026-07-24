import { describe, expect, it } from 'vitest';
import { createListItem, effectiveDirectoryFields, resetDirectoryOverrides } from '@naaseh/domain';
import { rebuildMixedIndex } from '../../src/search/index-migration.js';

describe('offline directory links', () => {
  it('uses snapshot offline, current global data after sync, and explicit overrides until reset', async () => {
    const linked = createListItem(
      '01J00000000000000000000000',
      {
        name: 'Milk',
        amountMinor: -399,
        directoryItemId: '01J00000000000000000000001',
        directoryVersion: 1,
      },
      'owner',
    );
    expect(effectiveDirectoryFields(linked).name).toBe('Milk');
    const overridden = {
      ...linked,
      nameOverride: 'Local milk',
      valueOverride: { kind: 'amount' as const, amountMinor: 200 },
    };
    const global = {
      id: '01J00000000000000000000001',
      name: 'Oat milk',
      amountMinor: -599,
      currency: 'USD',
      status: 'active' as const,
      createdBy: 'a',
      updatedBy: 'b',
      createdAt: linked.createdAt,
      updatedAt: linked.updatedAt,
      version: 2,
    };
    expect(effectiveDirectoryFields(overridden, global)).toEqual({
      name: 'Local milk',
      amountMinor: 200,
    });
    expect(effectiveDirectoryFields(resetDirectoryOverrides(overridden), global)).toEqual({
      name: 'Oat milk',
      amountMinor: -599,
    });
    const index = await rebuildMixedIndex({
      tasks: [],
      lists: [],
      listItems: [linked],
      directory: [global],
    });
    expect(index.search('oat')).toEqual([linked.id]);
  });
});
