import { describe, expect, it } from 'vitest';
import { canReadTask, createTask, postItColorSchema, taskInputSchema } from './task.js';

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
  it('rejects the removed Extra Low priority', () => {
    expect(taskInputSchema.safeParse({ label: 'Old value', urgency: 'extra_low' }).success).toBe(
      false,
    );
  });
  it('accepts only the fixed semantic post-it palette and keeps the override optional', () => {
    expect(postItColorSchema.options).toEqual([
      'yellow',
      'pink',
      'blue',
      'green',
      'purple',
      'orange',
    ]);
    expect(createTask({ label: 'Default note' }, 'steve').postItColor).toBeUndefined();
    expect(createTask({ label: 'Pink note', postItColor: 'pink' }, 'steve').postItColor).toBe(
      'pink',
    );
    expect(taskInputSchema.safeParse({ label: 'Unsafe', postItColor: '#ffffff' }).success).toBe(
      false,
    );
  });
});
