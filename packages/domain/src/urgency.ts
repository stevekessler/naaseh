import { z } from 'zod';

export const urgencyValues = ['low', 'medium', 'high', 'critical'] as const;

export const urgencySchema = z.enum(urgencyValues);
export type Urgency = z.infer<typeof urgencySchema>;

export const urgencyLabels = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
} as const satisfies Record<Urgency, string>;

export const defaultUrgency: Urgency = 'medium';

/** Return a unique urgency set in the stable product order. */
export function normalizeUrgencySet(values: readonly Urgency[]): Urgency[] {
  const selected = new Set(values);
  return urgencyValues.filter((urgency) => selected.has(urgency));
}

/** Parse an all-or-nothing comma-delimited urgency set from persisted input. */
export function parseUrgencySet(value: unknown): Urgency[] {
  if (value === undefined || value === null || value === '') return [];
  const values = Array.isArray(value) ? value : String(value).split(',');
  const parsed = values.map((item) => urgencySchema.safeParse(item));
  if (parsed.some((item) => !item.success)) return [];
  return normalizeUrgencySet(parsed.map((item) => item.data!));
}

export const serializeUrgencySet = (values: readonly Urgency[]) =>
  normalizeUrgencySet(values).join(',');

export const matchesUrgencySet = (urgency: Urgency, selected: readonly Urgency[] | undefined) =>
  !selected?.length || selected.includes(urgency);

export type UrgencyCounts = Record<Urgency, number>;

export const urgencyCountsSchema = z
  .object({
    low: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    critical: z.number().int().nonnegative(),
  })
  .strict();

export const zeroUrgencyCounts = (): UrgencyCounts =>
  urgencyCountsSchema.parse({
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  });
