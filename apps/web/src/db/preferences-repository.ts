import { taskDueDefaultsRequestSchema, type TaskDueDefaults } from '@naaseh/domain';
import { db } from './database.js';
export type TaskView = 'list' | 'postit';
export const saveView = (view: TaskView) => db.settings.put({ key: 'task-view', value: view });
export const loadView = async (): Promise<TaskView> =>
  (await db.settings.get('task-view'))?.value === 'postit' ? 'postit' : 'list';
export const saveCompletionSound = (enabled: boolean) =>
  db.settings.put({ key: 'completion-sound', value: String(enabled) });
export const loadCompletionSound = async () =>
  (await db.settings.get('completion-sound'))?.value !== 'false';

export interface ReportingPreferences {
  weekStartsOn: number;
}

export async function loadReportingPreferences(): Promise<ReportingPreferences> {
  const weekStart = await db.settings.get('report-week-start');
  await db.settings.delete('report-time-zone');
  const candidate = Number(weekStart?.value ?? 0);
  return {
    weekStartsOn: Number.isInteger(candidate) && candidate >= 0 && candidate <= 6 ? candidate : 0,
  };
}

export async function saveReportingPreferences(value: ReportingPreferences) {
  await db.settings.delete('report-time-zone');
  await db.settings.put({ key: 'report-week-start', value: String(value.weekStartsOn) });
}

const dueDefaultsKey = (userId: string) => `task-due-defaults:${userId}`;
const taskDueDefaultsPath = '/api/v1/profile/task-due-defaults';

export async function loadTaskDueDefaults(userId: string): Promise<TaskDueDefaults | undefined> {
  const stored = await db.settings.get(dueDefaultsKey(userId));
  if (!stored) return undefined;
  try {
    return taskDueDefaultsRequestSchema.parse(JSON.parse(stored.value)).defaults ?? undefined;
  } catch {
    return undefined;
  }
}

async function readDueDefaultsResponse(response: Response, userId: string) {
  if (!response.ok) throw new Error('Task defaults are unavailable.');
  const body = (await response.json()) as { userId?: string; defaults?: unknown };
  if (body.userId !== userId) throw new Error('The signed-in account changed.');
  return taskDueDefaultsRequestSchema.parse({ defaults: body.defaults });
}

export async function refreshTaskDueDefaults(userId: string, signal: AbortSignal) {
  const key = dueDefaultsKey(userId);
  const before = await db.settings.get(key);
  const response = await fetch(taskDueDefaultsPath, {
    credentials: 'include',
    cache: 'no-store',
    signal,
  });
  const saved = await readDueDefaultsResponse(response, userId);
  await db.transaction('rw', db.settings, async () => {
    const current = await db.settings.get(key);
    if (!signal.aborted && current?.value === before?.value)
      await db.settings.put({ key, value: JSON.stringify(saved) });
  });
}

export async function saveTaskDueDefaults(
  userId: string,
  csrfToken: string,
  defaults: TaskDueDefaults | null,
) {
  const response = await fetch(taskDueDefaultsPath, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
    body: JSON.stringify({ defaults }),
  });
  const saved = await readDueDefaultsResponse(response, userId);
  await db.settings.put({ key: dueDefaultsKey(userId), value: JSON.stringify(saved) });
}
