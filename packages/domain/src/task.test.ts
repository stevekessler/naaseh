import { describe, expect, it } from 'vitest';
import { canReadTask, createTask } from './task.js';

describe('task boundaries', () => {
  it('allows all active users to read public tasks', () => {
    expect(
      canReadTask(createTask({ label: 'Call', visibility: 'public' }, 'steve'), 'friend'),
    ).toBe(true);
  });
  it('restricts private tasks to their owner', () => {
    const task = createTask({ label: 'Secret', visibility: 'private' }, 'steve');
    expect(canReadTask(task, 'friend')).toBe(false);
    expect(canReadTask(task, 'steve')).toBe(true);
  });
});
