import type { FeatureHost } from '@naaseh/contacts-inventory-contracts';
import { CatalogPage } from './ContactTypesPage.js';

export function LocationsPage({ host }: { host: FeatureHost }) {
  return <CatalogPage host={host} kind="locations" />;
}
