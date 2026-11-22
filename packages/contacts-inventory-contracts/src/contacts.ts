import { z } from 'zod';

export const prescriberContactTypeId = 'prescriber';
export const catalogIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/u);
export const contactTypeSchema = z.strictObject({
  id: catalogIdSchema,
  name: z.string().trim().min(1).max(80),
  revision: z.int().positive(),
});
export type ContactType = z.infer<typeof contactTypeSchema>;

const short = z.string().trim().max(80).optional();
const phone = z.string().trim().max(40).optional();
const address = z.string().trim().max(200).optional();
export const preferredNumberSchema = z.enum(['phone', 'cell', 'emergencyNumber']);

export const contactFieldsSchema = z
  .strictObject({
    prefix: short,
    firstName: short,
    lastName: short,
    phone,
    fax: phone,
    cell: phone,
    emergencyNumber: phone,
    defaultNumber: preferredNumberSchema.optional(),
    addressLine1: address,
    addressLine2: address,
    city: short,
    state: z.string().trim().max(40).optional(),
    zip: z.string().trim().max(20).optional(),
    contactTypeId: catalogIdSchema.optional(),
  })
  .refine((value) => Boolean(value.firstName || value.lastName), {
    message: 'Enter a first name or last name.',
  })
  .transform((value) => {
    for (const field of Object.keys(value) as Array<keyof typeof value>) {
      if (!value[field]) delete value[field];
    }
    if (value.defaultNumber && !value[value.defaultNumber]) delete value.defaultNumber;
    return value;
  });
export type ContactFields = z.infer<typeof contactFieldsSchema>;

export function contactPayload(contact: ContactFields) {
  return Object.fromEntries(
    Object.entries(contact).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, value] as const],
    ),
  );
}

export function contactMatches(contact: ContactFields, query: string, type?: string) {
  if (type && contact.contactTypeId !== type) return false;
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const name = [contact.prefix, contact.firstName, contact.lastName].filter(Boolean).join(' ');
  if (name.toLowerCase().includes(needle)) return true;
  const digits = needle.replace(/\D/gu, '');
  return (
    Boolean(digits) &&
    /^[\d\s().+-]+$/u.test(needle) &&
    [contact.phone, contact.cell, contact.fax, contact.emergencyNumber].some((number) =>
      number?.replace(/\D/gu, '').includes(digits),
    )
  );
}
