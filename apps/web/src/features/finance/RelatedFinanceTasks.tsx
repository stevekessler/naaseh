import { useEffect, useState } from 'react';
import type { Task } from '@naaseh/domain';
import { financeRequest } from './finance-client.js';

export function RelatedFinanceTasks({
  targetType,
  targetId,
}: {
  targetType: 'transaction' | 'upcomingExpense';
  targetId: string;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  useEffect(() => {
    let active = true;
    const segment = targetType === 'transaction' ? 'transactions' : 'upcoming-expenses';
    void financeRequest<{ tasks: Task[] }>(
      `/finance/${segment}/${encodeURIComponent(targetId)}/tasks`,
    )
      .then(({ tasks: value }) => {
        if (active) setTasks(Array.isArray(value) ? value : []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [targetId, targetType]);
  if (!tasks.length) return null;
  return (
    <section aria-label="Related tasks">
      <h3>Related tasks</h3>
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            <a href={`/tasks/${encodeURIComponent(task.id)}`}>{task.label}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
