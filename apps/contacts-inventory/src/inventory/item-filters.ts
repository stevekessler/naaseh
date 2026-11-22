import { emptyMedicineFilters, type MedicineFilterValues } from './MedicineFilters.js';
import type { ImagePointer, ItemFields } from '@naaseh/contacts-inventory-contracts';

export type InventoryItem = {
  id: string;
  revision: number;
  fields: ItemFields;
  image?: ImagePointer;
  imageGeneration?: number;
};

export function visibleItems(
  items: InventoryItem[],
  name: string,
  locationId: string,
  type = '',
  medicineFilters: MedicineFilterValues = emptyMedicineFilters,
  medicationList = false,
) {
  const query = name.trim().toLowerCase();
  return items
    .filter(({ fields }) => {
      if (
        (locationId && fields.locationId !== locationId) ||
        !fields.name.toLowerCase().includes(query)
      )
        return false;
      if (medicationList) return fields.type === 'medicine' && fields.includeOnMedList;
      if (type && fields.type !== type) return false;
      if (type !== 'medicine' || fields.type !== 'medicine') return true;
      const { expirationFrom, expirationTo, includeOnMedList, ...choices } = medicineFilters;
      return (
        Object.entries(choices).every(
          ([name, value]) => !value || fields[name as keyof typeof choices] === value,
        ) &&
        (!includeOnMedList || fields.includeOnMedList === (includeOnMedList === 'yes')) &&
        (!expirationFrom ||
          Boolean(fields.expirationDate && fields.expirationDate >= expirationFrom)) &&
        (!expirationTo || Boolean(fields.expirationDate && fields.expirationDate <= expirationTo))
      );
    })
    .sort((a, b) => a.fields.name.localeCompare(b.fields.name) || a.id.localeCompare(b.id));
}
