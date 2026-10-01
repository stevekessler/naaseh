import { useEffect, useMemo, useState } from 'react';

export const taskColumns = [
  { id: 'project', label: 'Project' },
  { id: 'category', label: 'Category' },
  { id: 'memo', label: 'Memo' },
  { id: 'link', label: 'Link' },
  { id: 'due', label: 'Due date' },
  { id: 'priority', label: 'Priority' },
  { id: 'assignee', label: 'Assignee' },
  { id: 'actions', label: 'Actions' },
] as const;

export type TaskColumnId = (typeof taskColumns)[number]['id'];
type Breakpoint = 'phone' | 'tablet' | 'desktop';

const allColumns = taskColumns.map(({ id }) => id);
const defaults: Record<Breakpoint, TaskColumnId[]> = {
  phone: allColumns,
  tablet: allColumns,
  desktop: allColumns,
};

const currentBreakpoint = (): Breakpoint => {
  const width = globalThis.window?.innerWidth ?? 1441;
  if (width <= 640) return 'phone';
  if (width <= 1400 && globalThis.window?.matchMedia?.('(pointer: coarse)').matches)
    return 'tablet';
  return 'desktop';
};

const storageKey = (breakpoint: Breakpoint) => `naaseh.task-columns.v1.${breakpoint}`;

function readColumns(breakpoint: Breakpoint): TaskColumnId[] {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey(breakpoint)) ?? 'null') as unknown;
    if (Array.isArray(stored)) {
      const valid = stored.filter((value): value is TaskColumnId =>
        allColumns.includes(value as TaskColumnId),
      );
      if (valid.length === stored.length) return valid;
    }
  } catch {
    // Ignore unavailable or malformed device-local preferences.
  }
  return defaults[breakpoint];
}

export function useTaskColumns() {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(currentBreakpoint);
  const [visible, setVisible] = useState<TaskColumnId[]>(() => readColumns(breakpoint));

  useEffect(() => {
    const update = () => setBreakpoint(currentBreakpoint());
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => setVisible(readColumns(breakpoint)), [breakpoint]);

  const update = (next: TaskColumnId[]) => {
    setVisible(next);
    try {
      localStorage.setItem(storageKey(breakpoint), JSON.stringify(next));
    } catch {
      // The preference remains active for this visit when storage is unavailable.
    }
  };

  return {
    breakpoint,
    visible: useMemo(() => new Set(visible), [visible]),
    toggle(column: TaskColumnId) {
      update(
        visible.includes(column) ? visible.filter((item) => item !== column) : [...visible, column],
      );
    },
    reset() {
      update(defaults[breakpoint]);
    },
  };
}

export function TaskColumnSettings({
  breakpoint,
  visible,
  toggle,
  reset,
}: {
  breakpoint: Breakpoint;
  visible: ReadonlySet<TaskColumnId>;
  toggle: (column: TaskColumnId) => void;
  reset: () => void;
}) {
  return (
    <details className="task-column-settings">
      <summary>Columns</summary>
      <fieldset>
        <legend>Columns on this {breakpoint} layout</legend>
        <p>Task and completion are always shown.</p>
        <div>
          {taskColumns.map((column) => (
            <label key={column.id}>
              <input
                type="checkbox"
                aria-label={`Show ${column.label} column`}
                checked={visible.has(column.id)}
                onChange={() => toggle(column.id)}
              />
              {column.label}
            </label>
          ))}
        </div>
        <button type="button" className="quiet" onClick={reset}>
          Reset for {breakpoint}
        </button>
      </fieldset>
    </details>
  );
}
