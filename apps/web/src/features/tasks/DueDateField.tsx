import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  formatCalendarDate,
  splitTimeForDisplay,
  timeFromDisplay,
  type Meridiem,
} from './due-value.js';

export type DueDateValue = {
  dueKind: 'none' | 'date' | 'timed';
  dueDate: string;
  dueTime: string;
};

export function DueDateDialog({
  value,
  onChange,
  onClose,
  nestedDialog = false,
}: {
  value: DueDateValue;
  onChange: (value: DueDateValue) => void | Promise<void>;
  onClose: () => void;
  nestedDialog?: boolean;
}) {
  const dialog = useRef<HTMLElement>(null);
  const titleId = useId();
  const [draftKind, setDraftKind] = useState(value.dueKind === 'none' ? 'date' : value.dueKind);
  const [draftDate, setDraftDate] = useState(value.dueDate);
  const [draftTime, setDraftTime] = useState(value.dueTime);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.querySelector<HTMLInputElement>('input[type="date"]')?.focus();
  }, []);
  const close = () => {
    onClose();
  };
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
  const content = (
    <div className="modal-backdrop due-date-modal-backdrop">
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        className="due-date-dialog"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !saving) close();
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
          {error ? <p role="alert">{error}</p> : null}
          <fieldset disabled={saving} className="due-date-dialog-fields">
            <legend className="visually-hidden">Due date settings</legend>
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
          </fieldset>
          <div className="dialog-actions">
            <button
              type="button"
              disabled={!draftDate || saving}
              onClick={async () => {
                if (!draftDate || saving) return;
                setSaving(true);
                setError('');
                try {
                  await onChange({ dueKind: draftKind, dueDate: draftDate, dueTime: draftTime });
                  close();
                } catch (caught) {
                  setError(
                    caught instanceof Error ? caught.message : 'The due date could not be saved.',
                  );
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? 'Saving…' : 'Set due date'}
            </button>
            <button type="button" className="quiet" disabled={saving} onClick={close}>
              Cancel
            </button>
          </div>
        </div>
      </section>
    </div>
  );
  return !nestedDialog && typeof document !== 'undefined'
    ? createPortal(content, document.body)
    : content;
}

export function DueDateField({
  dueKind,
  dueDate,
  dueTime,
  onChange,
  nestedDialog = false,
}: DueDateValue & {
  onChange: (value: DueDateValue) => void;
  nestedDialog?: boolean;
}) {
  const [open, setOpen] = useState(false);
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
  return (
    <div className="due-date-field">
      <span>Due date</span>
      <div>
        <button
          type="button"
          className="quiet due-date-trigger"
          aria-label={label ? `Change due date, currently ${label}` : 'Add due date'}
          onClick={() => setOpen(true)}
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
        <DueDateDialog
          value={{ dueKind, dueDate, dueTime }}
          onChange={onChange}
          onClose={() => setOpen(false)}
          nestedDialog={nestedDialog}
        />
      ) : null}
    </div>
  );
}
