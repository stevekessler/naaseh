import { describe, expect, it } from 'vitest';
import { searchProjection } from '../../apps/contacts-inventory/src/search.js';
import {
  defaultFeatureSearchPreferences,
  normalizeFeatureSearchPreferences,
} from '../../apps/web/src/features/search/search-state.js';

describe('Contacts and Inventory Search scopes', () => {
  it.each([null, {}, { includeTasks: true }, { inventory: 'true' }])(
    'defaults absent, legacy, and invalid feature preferences to off',
    (value) => {
      expect(normalizeFeatureSearchPreferences(value)).toEqual(defaultFeatureSearchPreferences);
    },
  );

  it('matches only selected scopes and only includes safe summary fields', () => {
    const [contactId, inventoryId, medicineId] = ['contact', 'inventory', 'medicine'];
    const search = searchProjection([
      {
        kind: 'contact',
        id: contactId,
        revision: 1,
        fields: { firstName: 'Fixture contact', cell: '3035550123' },
      },
      {
        kind: 'item',
        id: inventoryId,
        revision: 1,
        fields: { type: 'base', name: 'Fixture item', locationId: 'closet' },
      },
      {
        kind: 'item',
        id: medicineId,
        revision: 1,
        fields: {
          type: 'medicine',
          name: 'Fixture medicine',
          locationId: 'closet',
          whoMed: 'both',
          status: 'current',
          timeTaken: 'night',
        },
      },
    ]);
    const expected = [
      { id: contactId, title: 'Fixture contact', type: 'contacts' },
      { id: inventoryId, title: 'Fixture item', type: 'inventory' },
      { id: medicineId, title: 'Fixture medicine', type: 'medicine' },
    ];
    for (let mask = 0; mask < 8; mask++) {
      expect(
        search('FIXTURE', {
          contacts: Boolean(mask & 1),
          inventory: Boolean(mask & 2),
          medicine: Boolean(mask & 4),
        }),
      ).toEqual(expected.filter((_, index) => Boolean(mask & (1 << index))));
    }
    expect(search('fixture', defaultFeatureSearchPreferences)).toEqual([]);
  });
});
