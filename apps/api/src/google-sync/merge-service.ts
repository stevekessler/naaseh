import type { GoogleTaskSnapshot, Task } from '@naaseh/domain';
import type { GoogleTask } from './google-client.js';

const partsInZone = (date: Date, timeZone: string) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string>;

export function localDateForTask(task: Pick<Task, 'dueAt' | 'dueTimeZone'>) {
  if (!task.dueAt || !task.dueTimeZone) return undefined;
  const parts = partsInZone(new Date(task.dueAt), task.dueTimeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Convert a wall-clock value in an IANA zone to UTC without adding a runtime timezone dependency. */
export function zonedDateTimeToIso(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  let guess = Date.UTC(year!, month! - 1, day!, hour!, minute!, 0);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = partsInZone(new Date(guess), timeZone);
    const represented = Date.UTC(
      Number(actual.year),
      Number(actual.month) - 1,
      Number(actual.day),
      Number(actual.hour),
      Number(actual.minute),
      Number(actual.second),
    );
    const wanted = Date.UTC(year!, month! - 1, day!, hour!, minute!, 0);
    const correction = wanted - represented;
    guess += correction;
    if (correction === 0) break;
  }
  return new Date(guess).toISOString();
}

export function replaceTaskDueDate(
  task: Pick<Task, 'dueAt' | 'dueTimeZone'>,
  dueDate: string,
  defaultTime: string,
  defaultTimeZone: string,
) {
  const zone = task.dueTimeZone ?? defaultTimeZone;
  const time = task.dueAt
    ? (() => {
        const parts = partsInZone(new Date(task.dueAt!), zone);
        return `${parts.hour}:${parts.minute}`;
      })()
    : defaultTime;
  return { dueAt: zonedDateTimeToIso(dueDate, time, zone), dueTimeZone: zone };
}

export function taskSnapshot(task: Task): GoogleTaskSnapshot | undefined {
  const dueDate = localDateForTask(task);
  if (!dueDate) return undefined;
  return {
    title: task.label.trim().slice(0, 300),
    dueDate,
    status:
      task.completionState === 'completed' || task.status === 'completed' ? 'completed' : 'open',
  };
}

export function googleTaskSnapshot(task: GoogleTask): GoogleTaskSnapshot | undefined {
  const dueDate = task.due?.slice(0, 10);
  if (!dueDate) return undefined;
  const title = task.title.trim().slice(0, 300) || 'Untitled Google task';
  return {
    title,
    dueDate,
    status: task.status === 'completed' ? 'completed' : 'open',
  };
}

export interface MergeConflict {
  field: keyof GoogleTaskSnapshot;
  baseValue: string;
  localValue: string;
  remoteValue: string;
}

export function mergeGoogleSnapshots(
  base: GoogleTaskSnapshot,
  local: GoogleTaskSnapshot,
  remote: GoogleTaskSnapshot,
) {
  const merged = { ...base };
  const conflicts: MergeConflict[] = [];
  for (const field of ['title', 'dueDate', 'status'] as const) {
    const localChanged = local[field] !== base[field];
    const remoteChanged = remote[field] !== base[field];
    if (localChanged && remoteChanged && local[field] !== remote[field])
      conflicts.push({
        field,
        baseValue: base[field],
        localValue: local[field],
        remoteValue: remote[field],
      });
    else if (localChanged) merged[field] = local[field] as never;
    else if (remoteChanged) merged[field] = remote[field] as never;
  }
  return { merged, conflicts };
}
