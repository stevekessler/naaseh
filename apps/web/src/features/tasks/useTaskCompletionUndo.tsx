import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Task } from '@naaseh/domain';
import { listLocalTasks, updateTask } from '../../db/task-repository.js';

export const taskUndoDurationMs = 30_000;
type UndoEntry = { task: Task; expiresAt: number; busy: boolean; error?: string };

export function useTaskCompletionUndo(ownerId: string | undefined) {
  const [entries, setEntries] = useState<UndoEntry[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const restoring = useRef(new Set<string>());
  const noticeRef = useRef<HTMLElement>(null);
  const hasEntries = entries.length > 0;
  useLayoutEffect(() => {
    const element = noticeRef.current;
    if (!element) return;
    const updateInset = () =>
      document.documentElement.style.setProperty(
        '--task-undo-inset',
        `${element.getBoundingClientRect().height + 32}px`,
      );
    updateInset();
    const observer = new ResizeObserver(updateInset);
    observer.observe(element);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--task-undo-inset');
    };
  }, [hasEntries]);
  useEffect(() => {
    const activeTimers = timers.current;
    setEntries([]);
    return () => {
      for (const timer of activeTimers.values()) clearTimeout(timer);
      activeTimers.clear();
    };
  }, [ownerId]);
  const dismiss = (id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setEntries((current) => current.filter((entry) => entry.task.id !== id));
  };
  const save = async (task: Task, patch: Partial<Task>, actorId: string) => {
    const next = await updateTask(task, patch, actorId);
    if (patch.status) dismiss(task.id);
    if (patch.status === 'completed' && next.completionState === 'completed') {
      setEntries((current) => [
        ...current,
        { task: next, expiresAt: Date.now() + taskUndoDurationMs, busy: false },
      ]);
      timers.current.set(
        task.id,
        setTimeout(() => dismiss(task.id), taskUndoDurationMs),
      );
    }
    return next;
  };
  const undo = async (entry: UndoEntry) => {
    if (!ownerId || Date.now() >= entry.expiresAt || restoring.current.has(entry.task.id)) return;
    restoring.current.add(entry.task.id);
    setEntries((current) =>
      current.map((item) => (item === entry ? { ...item, busy: true } : item)),
    );
    try {
      const latest = (await listLocalTasks()).find((task) => task.id === entry.task.id);
      if (
        !latest ||
        latest.lifecycle !== 'archived' ||
        latest.completionState !== 'completed' ||
        latest.currentCompletionEventId !== entry.task.currentCompletionEventId
      )
        throw new Error('This task has changed. Open the Archive to review it.');
      await updateTask(latest, { status: 'open' }, ownerId);
      dismiss(entry.task.id);
    } catch (error) {
      setEntries((current) =>
        current.map((item) =>
          item.task.id === entry.task.id
            ? {
                ...item,
                busy: false,
                error:
                  error instanceof Error ? error.message : 'Could not undo completion. Try again.',
              }
            : item,
        ),
      );
    } finally {
      restoring.current.delete(entry.task.id);
    }
  };
  const notice = entries.length ? (
    <aside ref={noticeRef} className="task-undo-notices" aria-label="Recently completed tasks">
      {entries.map((entry) => (
        <div className="task-undo-notice" key={entry.task.id}>
          <p role="status">Completed “{entry.task.label}”. Undo is available for 30 seconds.</p>
          <button
            type="button"
            disabled={entry.busy}
            onClick={() => void undo(entry)}
            aria-label={`Undo completion of ${entry.task.label}`}
          >
            {entry.busy ? 'Undoing…' : 'Undo'}
          </button>
          {entry.error && <p role="alert">{entry.error}</p>}
        </div>
      ))}
    </aside>
  ) : null;
  return { save, notice };
}
