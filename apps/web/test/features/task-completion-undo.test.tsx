// @vitest-environment jsdom
import { act, cleanup, renderHook, render, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createTask, completeAndArchiveTask } from '@naaseh/domain';
const repository = vi.hoisted(() => ({ updateTask: vi.fn(), listLocalTasks: vi.fn() }));
vi.mock('../../src/db/task-repository.js', () => repository);
import { useTaskCompletionUndo } from '../../src/features/tasks/useTaskCompletionUndo.js';
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.resetAllMocks();
});
it('offers completion undo for exactly 30 seconds', async () => {
  vi.useFakeTimers();
  const task = createTask({ label: 'First' }, 'owner');
  repository.updateTask.mockResolvedValue(completeAndArchiveTask(task, 'owner').task);
  const { result } = renderHook(() => useTaskCompletionUndo('owner'));
  await act(() => result.current.save(task, { status: 'completed' }, 'owner'));
  act(() => vi.advanceTimersByTime(29_999));
  expect(result.current.notice).not.toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(result.current.notice).toBeNull();
});
it('reopens the latest completed version and preserves edits made since completion', async () => {
  const task = createTask({ label: 'First' }, 'owner');
  const completed = completeAndArchiveTask(task, 'owner').task;
  repository.updateTask.mockResolvedValue(completed);
  const { result } = renderHook(() => useTaskCompletionUndo('owner'));
  await act(() => result.current.save(task, { status: 'completed' }, 'owner'));
  const latest = { ...completed, label: 'Renamed', version: completed.version + 1 };
  repository.listLocalTasks.mockResolvedValue([latest]);
  const view = render(result.current.notice);
  fireEvent.click(view.getByRole('button', { name: 'Undo completion of First' }));
  await waitFor(() =>
    expect(repository.updateTask).toHaveBeenLastCalledWith(latest, { status: 'open' }, 'owner'),
  );
});
