import { useEffect, useId, useRef, useState } from 'react';
import type { Task } from '@naaseh/domain';
import { formatCalendarDate, timeOptionsForTask } from './due-value.js';

export function DueDateField({
  task,
  dueKind,
  dueDate,
  dueTime,
  onChange,
  nestedDialog = false,
}: {
  task?: Task | undefined;
  dueKind: 'none' | 'date' | 'timed';
  dueDate: string;
  dueTime: string;
  onChange: (value: {
    dueKind: 'none' | 'date' | 'timed';
    dueDate: string;
    dueTime: string;
  }) => void;
  nestedDialog?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [draftKind, setDraftKind] = useState(dueKind === 'none' ? 'date' : dueKind);
  const [draftDate, setDraftDate] = useState(dueDate);
  const [draftTime, setDraftTime] = useState(dueTime);
  useEffect(() => {
    if (!open || !dialog.current || dialog.current.open) return;
    if (nestedDialog) dialog.current.show();
    else dialog.current.showModal();
  }, [nestedDialog, open]);
  const close = () => {
    dialog.current?.close();
    setOpen(false);
  };
  const label =
    dueKind === 'timed' && dueDate
      ? `${formatCalendarDate(dueDate)} ${new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        }).format(new Date(`2000-01-01T${dueTime}`))}`
      : dueDate
        ? formatCalendarDate(dueDate)
        : '';
  return (
    <div className="due-date-field">
      <span>Due date</span>
      <div>
        <button
          type="button"
          className="quiet due-date-trigger"
          aria-label={label ? `Change due date, currently ${label}` : 'Add due date'}
          onClick={() => {
            setDraftKind(dueKind === 'none' ? 'date' : dueKind);
            setDraftDate(dueDate);
            setDraftTime(dueTime);
            setOpen(true);
          }}
        >
          <span aria-hidden="true">📅</span> {label || 'Add date'}
        </button>
        {dueKind !== 'none' ? (
          <button
            type="button"
            className="quiet due-date-clear"
            onClick={() => onChange({ dueKind: 'none', dueDate: '', dueTime })}
          >
            Clear
          </button>
        ) : null}
      </div>
      {open ? (
        <dialog
          ref={dialog}
          className="due-date-dialog"
          aria-labelledby={titleId}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
        >
          <div>
            <h3 id={titleId}>Set due date</h3>
            <label>
              Due date
              <input
                type="date"
                value={draftDate}
                onChange={(event) => setDraftDate(event.target.value)}
                required
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draftKind === 'timed'}
                onChange={(event) => setDraftKind(event.target.checked ? 'timed' : 'date')}
              />
              Add a time
            </label>
            {draftKind === 'timed' ? (
              <label>
                Due time
                <select value={draftTime} onChange={(event) => setDraftTime(event.target.value)}>
                  {timeOptionsForTask(task?.dueAt).map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="dialog-actions">
              <button
                type="button"
                disabled={!draftDate}
                onClick={() => {
                  if (!draftDate) return;
                  onChange({ dueKind: draftKind, dueDate: draftDate, dueTime: draftTime });
                  close();
                }}
              >
                Set due date
              </button>
              <button type="button" className="quiet" onClick={close}>
                Cancel
              </button>
            </div>
          </div>
        </dialog>
      ) : null}
    </div>
  );
}
