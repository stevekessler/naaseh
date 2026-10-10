import { useEffect, useId, useRef, useState } from 'react';
import {
  formatCalendarDate,
  splitTimeForDisplay,
  timeFromDisplay,
  type Meridiem,
} from './due-value.js';

export function DueDateField({
  dueKind,
  dueDate,
  dueTime,
  onChange,
  nestedDialog = false,
}: {
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
  const dateLabel = dueDate ? formatCalendarDate(dueDate) : '';
  const timeLabel =
    dueKind === 'timed' && dueDate
      ? new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }).format(new Date(`2000-01-01T${dueTime}`))
      : '';
  const label = [dateLabel, timeLabel].filter(Boolean).join(' ');
  const displayTime = splitTimeForDisplay(draftTime);
  const updateDisplayTime = (next: Partial<typeof displayTime>) => {
    setDraftTime(
      timeFromDisplay(
        next.hour ?? displayTime.hour,
        next.minute ?? displayTime.minute,
        next.meridiem ?? displayTime.meridiem,
      ),
    );
  };
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
          <span className="due-date-calendar" aria-hidden="true">
            📅
          </span>
          {label ? (
            <span className="due-date-value">
              <span>{dateLabel}</span>
              {timeLabel ? <span className="due-date-time">{timeLabel}</span> : null}
            </span>
          ) : (
            <span>Add date</span>
          )}
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
            <header>
              <span aria-hidden="true">📅</span>
              <div>
                <h3 id={titleId}>Set due date</h3>
                <p>Choose when this task should be due.</p>
              </div>
            </header>
            <div className="due-date-dialog-fields">
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
                <fieldset className="due-time-fields">
                  <legend>Due time</legend>
                  <label>
                    <span>Hour</span>
                    <select
                      aria-label="Due time hour"
                      value={displayTime.hour}
                      onChange={(event) => updateDisplayTime({ hour: event.target.value })}
                    >
                      {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((hour) => (
                        <option key={hour} value={hour}>
                          {hour}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span aria-hidden="true">:</span>
                  <label>
                    <span>Minute</span>
                    <select
                      aria-label="Due time minute"
                      value={displayTime.minute}
                      onChange={(event) => updateDisplayTime({ minute: event.target.value })}
                    >
                      {Array.from({ length: 12 }, (_, index) =>
                        String(index * 5).padStart(2, '0'),
                      ).map((minute) => (
                        <option key={minute} value={minute}>
                          {minute}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>AM or PM</span>
                    <select
                      aria-label="Due time AM or PM"
                      value={displayTime.meridiem}
                      onChange={(event) =>
                        updateDisplayTime({ meridiem: event.target.value as Meridiem })
                      }
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </label>
                </fieldset>
              ) : null}
            </div>
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
