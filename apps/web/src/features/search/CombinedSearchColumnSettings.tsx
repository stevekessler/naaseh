import { useEffect, useMemo, useRef, useState } from 'react';

export const combinedSearchColumns = [
  { id: 'type', label: 'Type' },
  { id: 'list', label: 'List' },
  { id: 'category', label: 'Category' },
  { id: 'project', label: 'Project' },
  { id: 'memo', label: 'Memo' },
  { id: 'due', label: 'Due date' },
  { id: 'priority', label: 'Priority' },
  { id: 'status', label: 'Status' },
] as const;

export type CombinedSearchColumnId = (typeof combinedSearchColumns)[number]['id'];
type Breakpoint = 'phone' | 'tablet' | 'desktop';

const allColumns = combinedSearchColumns.map(({ id }) => id);
const defaults: Record<Breakpoint, CombinedSearchColumnId[]> = {
  phone: ['type', 'list', 'due', 'status'],
  tablet: ['type', 'list', 'category', 'project', 'due', 'priority', 'status'],
  desktop: allColumns,
};

const currentBreakpoint = (): Breakpoint => {
  const width = globalThis.window?.innerWidth ?? 1441;
  if (width <= 640) return 'phone';
  if (width <= 1400 && globalThis.window?.matchMedia?.('(pointer: coarse)').matches)
    return 'tablet';
  return 'desktop';
};

const storageKey = (breakpoint: Breakpoint) => `naaseh.combined-search-columns.v1.${breakpoint}`;

function readColumns(breakpoint: Breakpoint): CombinedSearchColumnId[] {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey(breakpoint)) ?? 'null') as unknown;
    if (Array.isArray(stored)) {
      const valid = stored.filter((value): value is CombinedSearchColumnId =>
        allColumns.includes(value as CombinedSearchColumnId),
      );
      if (valid.length === stored.length) return valid;
    }
  } catch {
    // Keep defaults when device-local preferences are unavailable or malformed.
  }
  return defaults[breakpoint];
}

export function useCombinedSearchColumns() {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(currentBreakpoint);
  const [visible, setVisible] = useState<CombinedSearchColumnId[]>(() => readColumns(breakpoint));

  useEffect(() => {
    const updateBreakpoint = () => setBreakpoint(currentBreakpoint());
    window.addEventListener('resize', updateBreakpoint);
    return () => window.removeEventListener('resize', updateBreakpoint);
  }, []);

  useEffect(() => setVisible(readColumns(breakpoint)), [breakpoint]);

  const update = (next: CombinedSearchColumnId[]) => {
    setVisible(next);
    try {
      localStorage.setItem(storageKey(breakpoint), JSON.stringify(next));
    } catch {
      // The choice still applies for this visit.
    }
  };

  return {
    breakpoint,
    visible: useMemo(() => new Set(visible), [visible]),
    toggle(column: CombinedSearchColumnId) {
      update(
        visible.includes(column) ? visible.filter((item) => item !== column) : [...visible, column],
      );
    },
    reset() {
      update(defaults[breakpoint]);
    },
  };
}

export function CombinedSearchColumnSettings({
  breakpoint,
  visible,
  toggle,
  reset,
}: ReturnType<typeof useCombinedSearchColumns>) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeWhenOutside = (event: PointerEvent) => {
      if (details.current?.open && !details.current.contains(event.target as Node))
        details.current.open = false;
    };
    document.addEventListener('pointerdown', closeWhenOutside);
    return () => document.removeEventListener('pointerdown', closeWhenOutside);
  }, []);

  return (
    <details ref={details} className="task-column-settings combined-search-column-settings">
      <summary>Columns</summary>
      <div className="task-column-settings-panel" role="group" aria-label="Search result columns">
        <header>
          <div>
            <strong>Choose visible columns</strong>
            <small>For this {breakpoint} layout</small>
          </div>
          <button
            type="button"
            className="quiet task-column-settings-close"
            aria-label="Close search result column settings"
            onClick={() => {
              if (details.current) details.current.open = false;
            }}
          >
            ×
          </button>
        </header>
        <p>Title stays visible.</p>
        <div className="task-column-options">
          {combinedSearchColumns.map((column) => (
            <label key={column.id}>
              <input
                type="checkbox"
                aria-label={`Show search ${column.label} column`}
                checked={visible.has(column.id)}
                onChange={() => toggle(column.id)}
              />
              {column.label}
            </label>
          ))}
        </div>
        <footer>
          <button type="button" className="quiet" onClick={reset}>
            Restore defaults
          </button>
        </footer>
      </div>
    </details>
  );
}
