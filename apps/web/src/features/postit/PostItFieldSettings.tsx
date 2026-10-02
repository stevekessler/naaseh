import { useEffect, useMemo, useRef, useState } from 'react';

export const postItFields = [
  { id: 'due', label: 'Due date' },
  { id: 'progress', label: 'Progress' },
  { id: 'priority', label: 'Priority' },
  { id: 'assignee', label: 'Assignee' },
  { id: 'category', label: 'Category' },
  { id: 'timer', label: 'Timer' },
  { id: 'link', label: 'Link' },
  { id: 'memo', label: 'Memo' },
] as const;

export type PostItFieldId = (typeof postItFields)[number]['id'];
type Breakpoint = 'phone' | 'tablet' | 'desktop';

const allFields = postItFields.map(({ id }) => id);
const currentBreakpoint = (): Breakpoint => {
  const width = globalThis.window?.innerWidth ?? 1441;
  if (width <= 640) return 'phone';
  if (width <= 1400 && globalThis.window?.matchMedia?.('(pointer: coarse)').matches)
    return 'tablet';
  return 'desktop';
};
const storageKey = (breakpoint: Breakpoint) => `naaseh.post-it-fields.v1.${breakpoint}`;

function readFields(breakpoint: Breakpoint): PostItFieldId[] {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey(breakpoint)) ?? 'null') as unknown;
    if (Array.isArray(stored)) {
      const valid = stored.filter((value): value is PostItFieldId =>
        allFields.includes(value as PostItFieldId),
      );
      if (valid.length === stored.length) return valid;
    }
  } catch {
    // Ignore unavailable or malformed device-local preferences.
  }
  return allFields;
}

export function usePostItFields() {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(currentBreakpoint);
  const [visible, setVisible] = useState<PostItFieldId[]>(() => readFields(breakpoint));

  useEffect(() => {
    const updateBreakpoint = () => setBreakpoint(currentBreakpoint());
    window.addEventListener('resize', updateBreakpoint);
    return () => window.removeEventListener('resize', updateBreakpoint);
  }, []);
  useEffect(() => setVisible(readFields(breakpoint)), [breakpoint]);

  const update = (next: PostItFieldId[]) => {
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
    toggle(field: PostItFieldId) {
      update(
        visible.includes(field) ? visible.filter((item) => item !== field) : [...visible, field],
      );
    },
    reset() {
      update(allFields);
    },
  };
}

export function PostItFieldSettings({
  breakpoint,
  visible,
  toggle,
  reset,
}: ReturnType<typeof usePostItFields>) {
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
    <details ref={details} className="task-column-settings postit-field-settings">
      <summary>Fields</summary>
      <fieldset>
        <legend>Fields on post-its for this {breakpoint} layout</legend>
        <p>Task and completion are always shown.</p>
        <div>
          {postItFields.map((field) => (
            <label key={field.id}>
              <input
                type="checkbox"
                aria-label={`Show ${field.label} on post-its`}
                checked={visible.has(field.id)}
                onChange={() => toggle(field.id)}
              />
              {field.label}
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
