import { z } from 'zod';

export const dueCalendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const localTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

function explicitZoneInstant(
  parts: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const formatted = Object.fromEntries(
      formatter
        .formatToParts(new Date(candidate))
        .filter(({ type }) => type !== 'literal')
        .map(({ type, value }) => [type, Number(value)]),
    ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;
    const represented = Date.UTC(
      formatted.year,
      formatted.month - 1,
      formatted.day,
      formatted.hour,
      formatted.minute,
      formatted.second,
    );
    const correction = target - represented;
    if (correction === 0) return new Date(candidate);
    candidate += correction;
  }
  throw new Error(`The selected local time does not exist in ${timeZone}.`);
}

export function localDueToInstant(localDate: string, localTime: string, timeZone?: string) {
  dueCalendarDateSchema.parse(localDate);
  localTimeSchema.parse(localTime);
  const [year, month, day] = localDate.split('-').map(Number) as [number, number, number];
  const [hour, minute] = localTime.split(':').map(Number) as [number, number];
  const value = timeZone
    ? explicitZoneInstant({ year, month, day, hour, minute }, timeZone)
    : new Date(year, month - 1, day, hour, minute, 0, 0);
  if (timeZone) return { dueAt: value.toISOString(), localDate, localTime };
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
