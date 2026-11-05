import {
  currentFinanceAccess,
  peekFinanceAccess,
  subscribeFinanceAccess,
} from '../finance/security/finance-access.js';
import { useEffect, useRef, useState } from 'react';
import { FinanceUnlock } from '../finance/security/FinanceUnlock.js';
import { db } from '../../db/database.js';
import { decryptFinanceRecord, financeDeviceKey } from '../../db/finance-repository.js';

export interface LocalFinancialTaskLink {
  id: string;
  budgetId: string;
  budgetItemId: string;
  taskId: string;
  status: 'active' | 'removed';
}

export async function readLocalFinancialTaskLink(taskId: string) {
  return currentFinanceAccess().read(async () => {
    const records = await db.secureFinanceRecords
      .where('entityType')
      .equals('financeTaskLink')
      .toArray();
    if (!records.length) return undefined;
    const key = await financeDeviceKey();
    for (const record of records) {
      const value = (await decryptFinanceRecord(record, key)) as Partial<LocalFinancialTaskLink>;
      if (
        value.taskId === taskId &&
        value.status === 'active' &&
        typeof value.budgetId === 'string' &&
        typeof value.budgetItemId === 'string' &&
        typeof value.id === 'string'
      ) {
        return value as LocalFinancialTaskLink;
      }
    }
    return undefined;
  });
}

/** The locked control is identical on every task, independent of protected link existence. */
export function FinancialTaskLink({ taskId }: { taskId: string }) {
  const [link, setLink] = useState<LocalFinancialTaskLink>();
  const [unlocking, setUnlocking] = useState(false);
  const [, changed] = useState(0);
  const visit = useRef(false);
  const controller = peekFinanceAccess();
  useEffect(() => {
    let active = true;
    let generation = 0;
    const refresh = () => {
      const current = ++generation;
      setLink(undefined);
      changed((value) => value + 1);
      if (!peekFinanceAccess()?.canRead()) return;
      void readLocalFinancialTaskLink(taskId)
        .then((value) => {
          if (active && current === generation) setLink(value);
        })
        .catch(() => undefined);
    };
    const unsubscribe = subscribeFinanceAccess(refresh);
    refresh();
    return () => {
      active = false;
      generation++;
      unsubscribe();
      if (visit.current) {
        visit.current = false;
        peekFinanceAccess()?.lock();
      }
    };
  }, [taskId]);

  if (controller?.securityReady && controller.requiresPin) {
    if (unlocking)
      return (
        <FinanceUnlock
          controller={controller}
          onUnlocked={() => setUnlocking(false)}
          onCancel={() => {
            visit.current = false;
            setUnlocking(false);
          }}
        />
      );
    if (!controller.canRead())
      return (
        <button
          onClick={() => {
            visit.current = true;
            setUnlocking(true);
          }}
        >
          Unlock Finance
        </button>
      );
  }
  if (!link) return null;
  return (
    <section className="financial-task-link" aria-label="Related financial item">
      <a
        href={`/finance/budgets/${encodeURIComponent(link.budgetId)}#item-${encodeURIComponent(link.budgetItemId)}`}
      >
        Open related financial item
      </a>
      {visit.current && controller?.requiresPin ? (
        <button onClick={() => controller.lock()}>Lock Finance</button>
      ) : null}
    </section>
  );
}
