import { describe, expect, it, vi } from 'vitest';
import { foregroundSyncIntervalMs, installForegroundSync } from './foreground-sync.js';

class FakeTarget extends EventTarget {
  interval: (() => void) | undefined;
  timeout: number | undefined;
  cleared: number | undefined;

  setInterval(handler: () => void, timeout: number) {
    this.interval = handler;
    this.timeout = timeout;
    return 17;
  }

  clearInterval(handle: number) {
    this.cleared = handle;
  }
}

describe('foreground synchronization', () => {
  it('syncs on focus, mobile resume, page restore, and the bounded visible interval', () => {
    const target = new FakeTarget();
    const document = new EventTarget() as EventTarget & {
      visibilityState: DocumentVisibilityState;
    };
    document.visibilityState = 'visible';
    const synchronize = vi.fn();
    const cleanup = installForegroundSync({ target, document, synchronize });

    target.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    target.dispatchEvent(new Event('pageshow'));
    target.interval?.();

    expect(synchronize).toHaveBeenCalledTimes(4);
    expect(target.timeout).toBe(foregroundSyncIntervalMs);
    cleanup();
    target.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    target.dispatchEvent(new Event('pageshow'));
    expect(synchronize).toHaveBeenCalledTimes(4);
    expect(target.cleared).toBe(17);
  });

  it('does not poll while the client is hidden', () => {
    const target = new FakeTarget();
    const document = new EventTarget() as EventTarget & {
      visibilityState: DocumentVisibilityState;
    };
    document.visibilityState = 'hidden';
    const synchronize = vi.fn();
    installForegroundSync({ target, document, synchronize });

    target.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    target.dispatchEvent(new Event('pageshow'));
    target.interval?.();

    expect(synchronize).not.toHaveBeenCalled();
  });
});
