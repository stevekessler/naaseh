import { z } from 'zod';

export const dueCalendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const localTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export function localDueToInstant(localDate: string, localTime: string) {
  dueCalendarDateSchema.parse(localDate);
  localTimeSchema.parse(localTime);
  const [year, month, day] = localDate.split('-').map(Number) as [number, number, number];
  const [hour, minute] = localTime.split(':').map(Number) as [number, number];
  const value = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    value.getFullYear() !== year ||
    value.getMonth() !== month - 1 ||
    value.getDate() !== day ||
    value.getHours() !== hour ||
    value.getMinutes() !== minute
  )
    throw new Error('The selected local time does not exist in the current browser time zone.');
  return { dueAt: value.toISOString(), localDate, localTime };
}

export function instantToLocalDue(dueAt: string) {
  const value = new Date(dueAt);
  if (Number.isNaN(value.getTime())) throw new Error('The due instant is invalid.');
  const two = (part: number) => String(part).padStart(2, '0');
  return {
    localDate: `${value.getFullYear()}-${two(value.getMonth() + 1)}-${two(value.getDate())}`,
    localTime: `${two(value.getHours())}:${two(value.getMinutes())}`,
  };
}
