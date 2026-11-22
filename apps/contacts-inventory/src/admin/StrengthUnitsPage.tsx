import type { FeatureHost } from '@naaseh/contacts-inventory-contracts';
import { CatalogPage } from './ContactTypesPage.js';

export function StrengthUnitsPage({ host }: { host: FeatureHost }) {
  return <CatalogPage host={host} kind="strength-units" />;
}
