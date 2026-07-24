import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import {
  cancelGenericReminder,
  genericPushPayload,
  reminderScheduleName,
  scheduleGenericReminder,
  subscriptionExpired,
} from '../../apps/api/src/notifications/web-push.js';
import { overdueFallback } from '../../apps/web/src/notifications/push.js';

describe('Web Push reminder lifecycle', () => {
  it('creates stable one-time schedules with identifier-only target input and updates replays', async () => {
    const commands: unknown[] = [];
    const client = {
      send: vi.fn(async (command: unknown) => {
        commands.push(command);
        if (commands.length === 1)
          throw Object.assign(new Error('exists'), { name: 'ConflictException' });
        return {};
      }),
    };
    const dueAt = new Date(Date.now() + 60_000).toISOString();
    const name = await scheduleGenericReminder(
      {
        taskId: 'task-1',
        userId: 'user-1',
        dueAt,
        targetArn: 'arn:aws:lambda:us-west-2:111122223333:function:notifications',
        schedulerRoleArn: 'arn:aws:iam::111122223333:role/scheduler',
      },
      client,
    );
    expect(name).toBe(reminderScheduleName('task-1', 'user-1'));
    expect(commands).toHaveLength(2);
    const serialized = JSON.stringify(commands);
    expect(serialized).toContain('task-1');
    expect(serialized).toContain('user-1');
    expect(serialized).not.toMatch(/memo|label|private details/i);
  });

  it('cancels schedules idempotently and recognizes expired subscriptions', async () => {
    const client = {
      send: vi.fn(async () => {
        throw Object.assign(new Error('gone'), { name: 'ResourceNotFoundException' });
      }),
    };
    await expect(cancelGenericReminder('task-1', 'user-1', client)).resolves.toBeUndefined();
    expect(subscriptionExpired(404)).toBe(true);
    expect(subscriptionExpired(410)).toBe(true);
    expect(subscriptionExpired(500)).toBe(false);
  });

  it('forces generic closed-app notification copy even when hostile fields arrive', async () => {
    const listeners = new Map<string, (event: any) => void>();
    const showNotification = vi.fn(async () => undefined);
    const context = vm.createContext({
      self: {
        addEventListener: (name: string, listener: (event: any) => void) =>
          listeners.set(name, listener),
        registration: { showNotification },
        clients: { openWindow: vi.fn() },
      },
      encodeURIComponent,
    });
    vm.runInContext(readFileSync('apps/web/public/push-sw.js', 'utf8'), context);
    let work: Promise<unknown> | undefined;
    listeners.get('push')!({
      data: { json: () => ({ taskId: 'task-1', title: 'Private label', body: 'Secret memo' }) },
      waitUntil: (promise: Promise<unknown>) => {
        work = promise;
      },
    });
    await work;
    expect(showNotification).toHaveBeenCalledWith(
      "Na'aseh reminder",
      expect.objectContaining({ body: 'A task is due.' }),
    );
    expect(JSON.stringify(showNotification.mock.calls)).not.toMatch(/Private label|Secret memo/);
  });

  it('shows an overdue fallback on next open and generic server payloads', () => {
    expect(overdueFallback('2020-01-01T00:00:00.000Z', false, Date.now())).toBe(true);
    expect(overdueFallback('2020-01-01T00:00:00.000Z', true, Date.now())).toBe(false);
    expect(genericPushPayload('task-1')).toBe(
      JSON.stringify({
        type: 'task-reminder',
        taskId: 'task-1',
        title: "Na'aseh reminder",
        body: 'A task is due.',
      }),
    );
  });
});
