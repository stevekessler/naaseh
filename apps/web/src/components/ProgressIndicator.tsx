import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';

export function ProgressIndicator({
  percent = 0,
  label = 'Task',
  onChange,
}: {
  percent?: number | undefined;
  label?: string;
  onChange?: (percent: number) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(percent);
  const detailsId = useId();
  const root = useRef<HTMLSpanElement>(null);
  const value = Math.max(0, Math.min(100, Math.round(percent)));

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <span
      ref={root}
      className={`progress-indicator${onChange ? ' is-editable' : ''}${open ? ' is-open' : ''}`}
    >
      <button
        type="button"
        className="progress-indicator-button"
        aria-label={`${label} progress: ${value}% complete`}
        aria-describedby={onChange ? undefined : detailsId}
        aria-controls={onChange ? detailsId : undefined}
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
        style={{ '--task-progress': `${value * 3.6}deg` } as CSSProperties}
      >
        <span aria-hidden="true">{value === 100 ? '✓' : ''}</span>
      </button>
      <span
        id={detailsId}
        className="progress-indicator-tooltip"
        role={onChange ? 'dialog' : 'tooltip'}
        aria-label={onChange ? `Adjust ${label} progress` : undefined}
      >
        {onChange ? (
          <span className="progress-indicator-editor" onClick={(event) => event.stopPropagation()}>
            <label>
              Progress: {draft}%
              <input
                aria-label={`${label} percent complete`}
                type="range"
                min="0"
                max="100"
                step="5"
                value={draft}
                onChange={(event) => setDraft(event.currentTarget.valueAsNumber)}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                void onChange(draft);
                setOpen(false);
              }}
            >
              Save
            </button>
          </span>
        ) : (
          `${value}% complete`
        )}
      </span>
    </span>
  );
}
