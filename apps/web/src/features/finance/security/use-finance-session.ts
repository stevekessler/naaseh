import { useEffect } from 'react';
import { createBrowserFinanceAccess, refreshFinanceSecurity } from './finance-access-session.js';
import { clearFinanceAccess, peekFinanceAccess } from './finance-access.js';
import { clearFinanceSearchIndexes } from '../../../search/finance-index.js';

export function useFinanceSession(
  ownerId: string | undefined,
  csrfToken: string | undefined,
  active: boolean,
) {
  useEffect(() => {
    if (!ownerId || !csrfToken || !active) return;
    const controller = createBrowserFinanceAccess(ownerId, csrfToken);
    let current = true;
    const cleanup = controller.onLock(clearFinanceSearchIndexes);
    const lifecycle = controller.bindLifecycle();
    const classifyConflicts = controller.subscribe(() => {
      if (!controller.canRead()) return;
      void import('../../../sync/conflict-review.js')
        .then(async ({ listReviewConflicts }) => {
          if (current && controller.canRead()) await listReviewConflicts({ classifyLegacy: true });
        })
        .catch(() => undefined);
    });
    const refresh = async () => {
      try {
        await controller.markStale();
        if (current) await refreshFinanceSecurity(controller, ownerId);
      } catch {
        /* The gate stays closed; ordinary tasks remain available. */
      }
    };
    const reconnect = () => {
      void refresh();
    };
    window.addEventListener('online', reconnect);
    window.addEventListener('pageshow', reconnect);
    void controller
      .restore()
      .then(async () => {
        if (current && navigator.onLine) await refreshFinanceSecurity(controller, ownerId);
      })
      .catch(() => {
        if (current) void controller.markStale().catch(() => undefined);
      });
    return () => {
      current = false;
      classifyConflicts();
      lifecycle();
      cleanup();
      window.removeEventListener('online', reconnect);
      window.removeEventListener('pageshow', reconnect);
      clearFinanceSearchIndexes();
      if (peekFinanceAccess() === controller) clearFinanceAccess();
    };
  }, [ownerId, csrfToken, active]);
}
