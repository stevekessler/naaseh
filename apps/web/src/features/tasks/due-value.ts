import { instantToLocalDue, localDueToInstant } from '@naaseh/domain';
import { useEffect, useState } from 'react';

export const fiveMinuteTimeOptions = () =>
  Array.from({ length: 24 * 12 }, (_, index) => {
    const minutes = index * 5;
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  });

export type Meridiem = 'AM' | 'PM';

export function splitTimeForDisplay(value: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  const hour24 = match ? Math.min(23, Math.max(0, Number(match[1] ?? 10))) : 10;
  const minute = match?.[2] ?? '00';
  return {
    hour: String(hour24 % 12 || 12),
    minute,
    meridiem: (hour24 >= 12 ? 'PM' : 'AM') as Meridiem,
  };
}

export function timeFromDisplay(hour: string, minute: string, meridiem: Meridiem) {
  const hour12 = Math.min(12, Math.max(1, Number(hour) || 12));
  const hour24 = (hour12 % 12) + (meridiem === 'PM' ? 12 : 0);
  return `${String(hour24).padStart(2, '0')}:${minute}`;
}

export function timeOptionsForTask(dueAt?: string) {
  const values = fiveMinuteTimeOptions();
  if (!dueAt) return values;
  const legacy = instantToLocalDue(dueAt).localTime;
  return values.includes(legacy) ? values : [legacy, ...values];
}

export function formatCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${Number(match[2])}/${Number(match[3])}/${match[1]}` : value;
}

export function formatDueValue(dueAt?: string, dueDate?: string) {
  if (dueAt)
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(dueAt));
  return dueDate ? formatCalendarDate(dueDate) : '';
}

export { instantToLocalDue, localDueToInstant };

export function useBrowserTimeZone() {
  const read = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [zone, setZone] = useState(read);
  useEffect(() => {
    const refresh = () => setZone(read());
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return zone;
}
