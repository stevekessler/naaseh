import { useState } from 'react';
import type { TaskInput } from '@naaseh/domain';
import { financeRequest } from '../finance-client.js';
import { TaskForm } from '../../tasks/TaskForm.js';

export function CreateFinancialTask({
  budgetItemId,
  description,
  applicableDate,
  currentUserId,
  csrfToken,
  verifyAccess,
  target,
}: {
  budgetItemId?: string;
  target?: { type: 'transaction' | 'upcomingExpense'; id: string };
  description: string;
  applicableDate?: string;
  currentUserId: string;
  csrfToken: string;
  verifyAccess: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [taskId, setTaskId] = useState<string>();
  const endpoint = budgetItemId
    ? `/finance/budget-items/${encodeURIComponent(budgetItemId)}/tasks`
    : target?.type === 'transaction'
      ? `/finance/transactions/${encodeURIComponent(target.id)}/tasks`
      : target
        ? `/finance/upcoming-expenses/${encodeURIComponent(target.id)}/tasks`
        : '';

  const submit = async (value: TaskInput) => {
    setBusy(true);
    setError('');
    try {
      if (!(await verifyAccess())) return;
      const created = await financeRequest<{ taskId: string; financialTaskLinkId: string }>(
        endpoint,
        {
          method: 'POST',
          csrfToken,
          idempotencyKey: crypto.randomUUID(),
          body: JSON.stringify({
            label: value.label,
            assigneeId: currentUserId,
            ...(value.dueDate ? { dueDate: value.dueDate } : {}),
          }),
        },
      );
      if (!(await verifyAccess())) return;
      setTaskId(created.taskId);
      setOpen(false);
    } catch {
      setError('The task was not created. Review the details and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="finance-task-control">
      {taskId ? (
        <a href={`/tasks/${encodeURIComponent(taskId)}`}>Open created task</a>
      ) : (
        <button type="button" onClick={() => setOpen(true)}>
          Create task
        </button>
      )}
      {error ? <p role="alert">{error}</p> : null}
      {open ? (
        <dialog open aria-label={`Create task from ${description}`}>
          <h2>Create task</h2>
          <p role="note">Task sharing stays separate from Finance access.</p>
          <TaskForm
            save={submit}
            initialLabel={description}
            {...(applicableDate ? { initialDueDate: applicableDate } : {})}
            defaultAssigneeId={currentUserId}
            cancel={() => setOpen(false)}
            submitLabel={busy ? 'Creating…' : 'Create task'}
          />
        </dialog>
      ) : null}
    </div>
  );
}
