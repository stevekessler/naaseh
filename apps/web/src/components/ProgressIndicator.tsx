import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';

export function ProgressIndicator({
  percent = 0,
  label = 'Task',
}: {
  percent?: number | undefined;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const root = useRef<HTMLSpanElement>(null);
  const value = Math.max(0, Math.min(100, Math.round(percent)));

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <span ref={root} className={`progress-indicator${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="progress-indicator-button"
        aria-label={`${label} progress: ${value}% complete`}
        aria-describedby={tooltipId}
        aria-expanded={open}
        onClick={(event) => event.stopPropagation()}
        onPointerUp={(event) => {
          event.stopPropagation();
          if (event.pointerType === 'touch' || event.pointerType === 'pen')
            setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
        style={{ '--task-progress': `${value * 3.6}deg` } as CSSProperties}
      >
        <span aria-hidden="true" />
      </button>
      <span id={tooltipId} className="progress-indicator-tooltip" role="tooltip">
        {value}% complete
      </span>
    </span>
  );
}
