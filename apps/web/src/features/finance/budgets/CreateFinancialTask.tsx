import { FormEvent, useState } from 'react';
import { financeRequest } from '../finance-client.js';

export function CreateFinancialTask({
  budgetItemId,
  budgetId,
  description,
  applicableDate,
  currentUserId,
  csrfToken,
}: {
  budgetItemId: string;
  budgetId?: string;
  description: string;
  applicableDate?: string;
  currentUserId: string;
  csrfToken: string;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(description);
  const [dueDate, setDueDate] = useState(applicableDate ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [taskId, setTaskId] = useState<string>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await financeRequest<{ taskId: string; financialTaskLinkId: string }>(
        `/finance/budget-items/${budgetItemId}/tasks`,
        {
          method: 'POST',
          csrfToken,
          idempotencyKey: crypto.randomUUID(),
          body: JSON.stringify({
            label,
            ...(budgetId ? { budgetId } : {}),
            assigneeId: currentUserId,
            ...(dueDate ? { dueDate } : {}),
          }),
        },
      );
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
          <form onSubmit={(event) => void submit(event)}>
            <h2>Create task</h2>
            <label>
              Task label
              <input value={label} onChange={(event) => setLabel(event.target.value)} required />
            </label>
            <label>
              Due date
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </label>
            <p role="note">Task sharing stays separate from Finance access.</p>
            <div>
              <button type="button" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" disabled={busy}>
                {busy ? 'Creating…' : 'Create task'}
              </button>
            </div>
          </form>
        </dialog>
      ) : null}
    </div>
  );
}
