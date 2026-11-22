import type { ItemFields } from '@naaseh/contacts-inventory-contracts';

export type InventoryItem = { id: string; revision: number; fields: ItemFields };

export function visibleItems(items: InventoryItem[], name: string, locationId: string) {
  const query = name.trim().toLowerCase();
  return items
    .filter(
      ({ fields }) =>
        (!locationId || fields.locationId === locationId) &&
        fields.name.toLowerCase().includes(query),
    )
    .sort((a, b) => a.fields.name.localeCompare(b.fields.name) || a.id.localeCompare(b.id));
}
