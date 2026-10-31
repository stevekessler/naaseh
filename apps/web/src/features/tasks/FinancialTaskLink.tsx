import { useEffect, useState } from 'react';
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
}

/** Missing Finance cache authorization renders nothing, avoiding even a hidden-link signal. */
export function FinancialTaskLink({ taskId }: { taskId: string }) {
  const [link, setLink] = useState<LocalFinancialTaskLink>();
  useEffect(() => {
    let active = true;
    void readLocalFinancialTaskLink(taskId)
      .then((value) => {
        if (active) setLink(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [taskId]);
  if (!link) return null;
  return (
    <section className="financial-task-link" aria-label="Related financial item">
      <a
        href={`/finance/budgets/${encodeURIComponent(link.budgetId)}#item-${encodeURIComponent(link.budgetItemId)}`}
      >
        Open related financial item
      </a>
    </section>
  );
}
