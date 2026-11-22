import type { FeatureHost } from '@naaseh/contacts-inventory-contracts';
import { InventoryPage } from './InventoryPage.js';

export function MedicationListPage({ host }: { host: FeatureHost }) {
  return <InventoryPage host={host} medicationList />;
}
