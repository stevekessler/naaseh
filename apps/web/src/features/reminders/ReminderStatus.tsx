import type { Task } from '@naaseh/domain';
import { overdue } from '../../notifications/local-reminders.js';
export function ReminderStatus({ task }: { task: Task }) {
  return overdue(task) ? <span role="status">Overdue</span> : null;
}
