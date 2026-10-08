import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReminderSettings } from '../../src/features/reminders/ReminderSettings.js';
import { SyncStatus } from '../../src/features/sync/SyncStatus.js';
import {
  announceServiceWorkerUpdate,
  subscribeToServiceWorkerUpdate,
} from '../../src/app/service-worker-update.js';
import { registerAppServiceWorker } from '../../src/app/register-service-worker.js';

describe('header controls', () => {
  it('does not offer push reminders when the deployment has no public key', () => {
    expect(renderToStaticMarkup(<ReminderSettings csrfToken="token" />)).toBe('');
  });

  it('separates a synchronization error from its summary and retry action', () => {
    const html = renderToStaticMarkup(
      <SyncStatus
        online
        pending={1}
        error="A pending change was rejected and remains stored."
        retry={() => undefined}
      />,
    );

    expect(html).toContain('class="sync-status-summary"');
    expect(html).toContain('class="sync-status-error"');
    expect(html).toContain('<button>Retry</button>');
    const conflicted = renderToStaticMarkup(
      <SyncStatus
        online={false}
        pending={1}
        conflicts={1}
        error="Server failure"
        retry={() => undefined}
        reviewConflicts={() => undefined}
      />,
    );
    expect(conflicted).toContain(
      '<button class="sync-status-summary" aria-label="Review conflicts (1)">1 conflict',
    );
    expect(conflicted).toContain('review and resolve');
    expect(conflicted).toContain('Server failure');
    expect(conflicted).toContain('<button>Retry</button>');
  });

  it('opens pending work and seven-day local history from the sync summary', () => {
    const html = renderToStaticMarkup(
      <SyncStatus
        online
        pending={1}
        pendingItems={[
          {
            key: 'ordinary:change-1',
            id: 'change-1',
            entityId: 'task-1',
            area: 'tasks and lists',
            entityType: 'task',
            queuedAt: '2026-10-07T20:00:00.000Z',
            attempts: 2,
            title: 'Call Adam',
          },
        ]}
        history={[
          {
            eventId: 'synced:ordinary:change-0',
            key: 'ordinary:change-0',
            id: 'change-0',
            entityId: 'list-item-1',
            area: 'tasks and lists',
            entityType: 'listItem',
            queuedAt: '2026-10-07T18:00:00.000Z',
            attempts: 0,
            status: 'synced',
            occurredAt: '2026-10-07T19:00:00.000Z',
          },
        ]}
        retry={() => undefined}
      />,
    );

    expect(html).toContain('<summary class="sync-status-summary">1 pending · syncing</summary>');
    expect(html).toContain('Scheduled to sync');
    expect(html).toContain('Call Adam</strong>');
    expect(html).toContain('Task · tasks and lists');
    expect(html).toContain('2 retries');
    expect(html).toContain('Last 7 days');
    expect(html).toContain('List item · synced');
    expect(html).toContain('Private task titles are never recorded');
    expect(html).not.toContain('change-1');
  });

  it('retains updates and reloads an activated shell only after user action', async () => {
    const apply = () => undefined;
    announceServiceWorkerUpdate(apply);
    let observed: (() => void) | undefined;
    const unsubscribe = subscribeToServiceWorkerUpdate((next) => {
      observed = next;
    });

    expect(observed).toBe(apply);
    const original = {};
    const installing = Object.assign(new EventTarget(), { state: 'installing' });
    const registration = Object.assign(new EventTarget(), {
      active: original,
      installing,
      update: vi.fn(async () => {}),
    });
    const register = vi.fn(async () => registration);
    const reload = vi.fn();
    vi.stubGlobal('navigator', { serviceWorker: { controller: original, register } });
    const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('document', document);
    vi.stubGlobal('window', { location: { reload } });
    try {
      await registerAppServiceWorker();
      expect(register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' });
      expect(observed).toBe(apply);
      registration.active = installing;
      installing.state = 'activated';
      installing.dispatchEvent(new Event('statechange'));
      expect(observed).not.toBe(apply);
      expect(reload).not.toHaveBeenCalled();
      await observed?.();
      expect(reload).toHaveBeenCalledOnce();
      document.dispatchEvent(new Event('visibilitychange'));
      expect(registration.update).toHaveBeenCalledOnce();
    } finally {
      unsubscribe();
      vi.unstubAllGlobals();
    }
  });
});
