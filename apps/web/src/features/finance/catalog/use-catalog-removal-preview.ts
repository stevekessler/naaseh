import { useCallback, useEffect, useRef, useState } from 'react';
import { peekFinanceAccess } from '../security/finance-access.js';
import { financeRequest } from '../finance-client.js';
import {
  disposeFinanceApiSnapshot,
  loadFinanceApiSnapshot,
  readFinanceApiSnapshot,
  type FinanceApiSnapshot,
} from '../../../sync/finance-api-snapshot.js';

type Preview = {
  recordId: string;
  recordType: 'category' | 'merchant';
  expectedVersion: number;
  outcome: 'archive' | 'permanent-delete' | 'tombstone';
  confirmationToken: string;
};

export function useCatalogRemovalPreview(
  kind: Preview['recordType'],
  userId: string,
  csrfToken: string,
) {
  const [preview, setPreview] = useState<Pick<Preview, 'recordId' | 'outcome'>>();
  const [pending, setPending] = useState(false);
  const snapshot = useRef<FinanceApiSnapshot<Preview> | undefined>(undefined);
  const revision = useRef(0);
  const discard = useCallback(() => {
    revision.current++;
    if (snapshot.current) disposeFinanceApiSnapshot(snapshot.current);
    snapshot.current = undefined;
  }, []);
  const clear = useCallback(() => {
    discard();
    setPreview(undefined);
    setPending(false);
  }, [discard]);

  useEffect(() => {
    clear();
    const unsubscribe = peekFinanceAccess()?.onLock(clear);
    return () => {
      unsubscribe?.();
      discard();
    };
  }, [clear, discard, kind, userId]);

  const load = async (id: string) => {
    clear();
    setPending(true);
    const current = revision.current;
    let retained: FinanceApiSnapshot<Preview> | undefined;
    try {
      retained = await loadFinanceApiSnapshot((request) =>
        request<Preview>(`/finance/records/${kind}/${encodeURIComponent(id)}/deletion-preview`),
      );
      if (current !== revision.current) return false;
      const value = await readFinanceApiSnapshot(retained, ({ recordId, recordType, outcome }) => {
        if (recordId !== id || recordType !== kind) throw new Error('Removal preview changed.');
        return { recordId, outcome };
      });
      if (current !== revision.current) return false;
      snapshot.current = retained;
      setPreview(value);
      return true;
    } catch {
      return false;
    } finally {
      if (retained && snapshot.current !== retained) disposeFinanceApiSnapshot(retained);
      if (current === revision.current) setPending(false);
    }
  };

  const confirm = async (id: string) => {
    const retained = snapshot.current;
    if (!retained || pending) return undefined;
    setPending(true);
    const current = revision.current;
    try {
      const value = await readFinanceApiSnapshot(retained, (data) => data);
      if (value.recordId !== id || current !== revision.current) return undefined;
      await financeRequest(`/finance/records/${kind}/${encodeURIComponent(id)}/deletion`, {
        method: 'POST',
        csrfToken,
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({
          expectedVersion: value.expectedVersion,
          confirmationToken: value.confirmationToken,
        }),
      });
      return current === revision.current ? value.outcome : undefined;
    } catch {
      return undefined;
    } finally {
      if (current === revision.current) clear();
    }
  };

  return { preview, pending, load, confirm, clear };
}
