import { contactMatches, type ContactFields } from '@naaseh/contacts-inventory-contracts';

export type DirectoryContact = { id: string; revision: number; fields: ContactFields };

export function contactName(fields: ContactFields) {
  return [fields.prefix, fields.firstName, fields.lastName].filter(Boolean).join(' ');
}

export function visibleContacts(contacts: DirectoryContact[], text: string, type: string) {
  return contacts
    .filter(({ fields }) => contactMatches(fields, text, type))
    .sort(
      (a, b) =>
        contactName(a.fields).localeCompare(contactName(b.fields)) || a.id.localeCompare(b.id),
    );
}
