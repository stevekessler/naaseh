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
