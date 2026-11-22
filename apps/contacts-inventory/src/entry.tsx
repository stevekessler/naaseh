import { createRoot } from 'react-dom/client';
import { hostProtocol, type FeatureModule } from '@naaseh/contacts-inventory-contracts';
import { ContactsPage } from './contacts/ContactsPage.js';
import { InventoryPage } from './inventory/InventoryPage.js';
import { LocationsPage } from './admin/LocationsPage.js';
import { ContactTypesPage } from './admin/ContactTypesPage.js';

export const protocol = hostProtocol;

export const mount: FeatureModule['mount'] = (container, location, host) => {
  const root = createRoot(container);
  if (location.page === 'contacts') {
    root.render(
      <ContactsPage host={host} {...(location.recordId ? { recordId: location.recordId } : {})} />,
    );
  } else if (location.page === 'inventory') {
    root.render(
      <InventoryPage host={host} {...(location.recordId ? { recordId: location.recordId } : {})} />,
    );
  } else if (location.page === 'catalog' && location.catalog === 'locations' && host.isAdmin) {
    root.render(<LocationsPage host={host} />);
  } else if (location.page === 'catalog' && location.catalog === 'contact-types' && host.isAdmin) {
    root.render(<ContactTypesPage host={host} />);
  } else {
    root.render(<p role="status">This feature page is not available in this release.</p>);
  }
  return () => root.unmount();
};
