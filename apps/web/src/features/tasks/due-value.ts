import { instantToLocalDue, localDueToInstant } from '@naaseh/domain';
import { useEffect, useState } from 'react';

export const fiveMinuteTimeOptions = () =>
  Array.from({ length: 24 * 12 }, (_, index) => {
    const minutes = index * 5;
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  });

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
