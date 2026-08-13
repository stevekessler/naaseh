import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReminderSettings } from '../../src/features/reminders/ReminderSettings.js';
import { SyncStatus } from '../../src/features/sync/SyncStatus.js';
import {
  announceServiceWorkerUpdate,
  subscribeToServiceWorkerUpdate,
} from '../../src/app/service-worker-update.js';

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
  });

  it('retains an early service-worker update until the application subscribes', () => {
    const apply = () => undefined;
    announceServiceWorkerUpdate(apply);
    let observed: (() => void) | undefined;
    const unsubscribe = subscribeToServiceWorkerUpdate((next) => {
      observed = next;
    });

    expect(observed).toBe(apply);
    unsubscribe();
  });
});
