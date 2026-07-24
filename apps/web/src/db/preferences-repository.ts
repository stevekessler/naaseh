import { db } from './database.js';
export type TaskView = 'list' | 'postit';
export const saveView = (view: TaskView) => db.settings.put({ key: 'task-view', value: view });
export const loadView = async (): Promise<TaskView> =>
  (await db.settings.get('task-view'))?.value === 'postit' ? 'postit' : 'list';
export const saveCompletionSound = (enabled: boolean) =>
  db.settings.put({ key: 'completion-sound', value: String(enabled) });
export const loadCompletionSound = async () =>
  (await db.settings.get('completion-sound'))?.value !== 'false';
