import { readFinanceCachedData } from '../../sync/finance-cache-access.js';
import { peekFinanceAccess, subscribeFinanceAccess } from '../finance/security/finance-access.js';
import { useEffect, useRef, useState } from 'react';
import { FinanceUnlock } from '../finance/security/FinanceUnlock.js';
import { db } from '../../db/database.js';
import { decryptFinanceRecord, financeDeviceKey } from '../../db/finance-repository.js';

export interface LocalFinancialTaskLink {
  id: string;
  taskId: string;
  targetType: 'budgetItem' | 'transaction' | 'upcomingExpense';
  targetId: string;
  budgetId?: string;
  status: 'active' | 'removed';
  upcomingExpense?: {
    description: string;
    dueDate: string;
    expectedAmountMinor: number;
    currency: string;
    currencyExponent: number;
    accountName: string;
  };
}

export async function readLocalFinancialTaskLinks(taskIds: readonly string[]) {
  if (taskIds.length > 50) throw new Error('Visible Finance task batches are limited to fifty.');
  const requested = new Set(taskIds);
  return readFinanceCachedData(async (lease) => {
    const records = await db.secureFinanceRecords
      .where('entityType')
      .equals('financeTaskLink')
      .toArray();
    if (!records.length) return [];
    const key = await financeDeviceKey();
    const links: LocalFinancialTaskLink[] = [];
    for (const record of records) {
      const value = (await decryptFinanceRecord(record, key, lease)) as Partial<
        LocalFinancialTaskLink & { budgetItemId: string }
      >;
      const targetType = value.targetType ?? (value.budgetItemId ? 'budgetItem' : undefined);
      const targetId = value.targetId ?? value.budgetItemId;
      if (
        typeof value.taskId === 'string' &&
        requested.has(value.taskId) &&
        value.status === 'active' &&
        targetType &&
        typeof targetId === 'string' &&
        typeof value.id === 'string'
      ) {
        links.push({
          id: value.id,
          taskId: value.taskId,
          targetType,
          targetId,
          ...(typeof value.budgetId === 'string' ? { budgetId: value.budgetId } : {}),
          status: 'active',
        });
      }
    }
    const upcomingLinks = links.filter(({ targetType }) => targetType === 'upcomingExpense');
    if (!upcomingLinks.length) return links;
    const expenseRecords = await db.secureFinanceRecords.bulkGet(
      upcomingLinks.map(({ targetId }) => targetId),
    );
    const expenses = new Map<string, Record<string, unknown>>();
    for (const record of expenseRecords) {
      if (!record || record.entityType !== 'financeUpcomingExpense') continue;
      const value = (await decryptFinanceRecord(record, key, lease)) as Record<string, unknown>;
      expenses.set(record.id, value);
    }
    const accountIds = [
      ...new Set(
        [...expenses.values()].flatMap((value) =>
          typeof value.accountId === 'string' ? [value.accountId] : [],
        ),
      ),
    ];
    const accountRecords = await db.secureFinanceRecords.bulkGet(accountIds);
    const accountNames = new Map<string, string>();
    for (const record of accountRecords) {
      if (!record || record.entityType !== 'financeAccount') continue;
      const value = (await decryptFinanceRecord(record, key, lease)) as Record<string, unknown>;
      accountNames.set(
        record.id,
        String(value.friendlyName ?? value.sourceName ?? 'Finance account'),
      );
    }
    return links.map((link) => {
      if (link.targetType !== 'upcomingExpense') return link;
      const expense = expenses.get(link.targetId);
      if (
        !expense ||
        typeof expense.description !== 'string' ||
        typeof expense.dueDate !== 'string' ||
        typeof expense.expectedAmountMinor !== 'number' ||
        typeof expense.currency !== 'string' ||
        typeof expense.accountId !== 'string'
      )
        return link;
      return {
        ...link,
        upcomingExpense: {
          description: expense.description,
          dueDate: expense.dueDate,
          expectedAmountMinor: expense.expectedAmountMinor,
          currency: expense.currency,
          currencyExponent:
            typeof expense.currencyExponent === 'number' ? expense.currencyExponent : 2,
          accountName: accountNames.get(expense.accountId) ?? 'Finance account',
        },
      };
    });
  });
}

export async function readLocalFinancialTaskLink(taskId: string) {
  return (await readLocalFinancialTaskLinks([taskId]))[0];
}

export function financialTaskTargetHref(link: LocalFinancialTaskLink) {
  if (link.targetType === 'budgetItem' && link.budgetId)
    return `/finance/budgets/${encodeURIComponent(link.budgetId)}#item-${encodeURIComponent(link.targetId)}`;
  if (link.targetType === 'transaction')
    return `/finance/transactions/${encodeURIComponent(link.targetId)}`;
  return `/finance/upcoming-expenses/${encodeURIComponent(link.targetId)}`;
}

export function useVisibleFinancialTaskLinks(taskIds: readonly string[], enabled: boolean) {
  const [links, setLinks] = useState<ReadonlyMap<string, LocalFinancialTaskLink[]>>(new Map());
  const signature = taskIds.join('|');
  useEffect(() => {
    let active = true;
    const refresh = () => {
      setLinks(new Map());
      if (!enabled || !peekFinanceAccess()?.canRead()) return;
      void readLocalFinancialTaskLinks(taskIds.slice(0, 50)).then((items) => {
        if (!active) return;
        const grouped = new Map<string, LocalFinancialTaskLink[]>();
        for (const item of items) grouped.set(item.taskId, [...(grouped.get(item.taskId) ?? []), item]);
        setLinks(grouped);
      }).catch(() => undefined);
    };
    const unsubscribe = subscribeFinanceAccess(refresh);
    refresh();
    return () => { active = false; unsubscribe(); };
  }, [enabled, signature]);
  return links;
}

export function UpcomingExpenseTaskLinks({ links = [] }: { links?: readonly LocalFinancialTaskLink[] | undefined }) {
  const upcoming = links.filter(({ targetType }) => targetType === 'upcomingExpense');
  const controller = peekFinanceAccess();
  const [unlocking, setUnlocking] = useState(false);
  if (controller?.securityReady && controller.requiresPin && !controller.canRead())
    return unlocking ? (
      <FinanceUnlock
        controller={controller}
        onUnlocked={() => setUnlocking(false)}
        onCancel={() => setUnlocking(false)}
      />
    ) : (
      <button type="button" onClick={() => setUnlocking(true)}>Unlock Finance</button>
    );
  if (!upcoming.length) return <span aria-hidden="true">—</span>;
  const money = (link: LocalFinancialTaskLink) => {
    const expense = link.upcomingExpense;
    if (!expense) return undefined;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: expense.currency,
      minimumFractionDigits: expense.currencyExponent,
      maximumFractionDigits: expense.currencyExponent,
    }).format(expense.expectedAmountMinor / 10 ** expense.currencyExponent);
  };
  if (upcoming.length > 1 && upcoming.some(({ upcomingExpense }) => !upcomingExpense))
    return <span>{upcoming.length} upcoming expenses</span>;
  return (
    <ul className="upcoming-expense-task-links">
      {upcoming.map((link) => (
        <li key={link.id}>
          <a href={financialTaskTargetHref(link)}>
            {link.upcomingExpense?.description ?? 'Upcoming expense'}
          </a>
          {link.upcomingExpense ? (
            <small>
              {' '}
              {link.upcomingExpense.dueDate} · {money(link)} · {link.upcomingExpense.accountName}
            </small>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** The locked control is identical on every task, independent of protected link existence. */
export function FinancialTaskLink({ taskId }: { taskId: string }) {
  const [links, setLinks] = useState<LocalFinancialTaskLink[]>([]);
  const [unlocking, setUnlocking] = useState(false);
  const [, changed] = useState(0);
  const visit = useRef(false);
  const controller = peekFinanceAccess();
  useEffect(() => {
    let active = true;
    let generation = 0;
    const refresh = () => {
      const current = ++generation;
      setLinks([]);
      changed((value) => value + 1);
      if (!peekFinanceAccess()?.canRead()) return;
      void readLocalFinancialTaskLinks([taskId])
        .then((value) => {
          if (active && current === generation) setLinks(value);
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
  if (!links.length) return null;
  return (
    <section className="financial-task-link" aria-label="Related financial item">
      <h3>Related Finance records</h3>
      <ul>
        {links.map((link) => (
          <li key={link.id}>
            <a href={financialTaskTargetHref(link)}>
              Open related financial item
            </a>
            <small> ({link.targetType === 'upcomingExpense' ? 'upcoming expense' :
              link.targetType === 'transaction' ? 'transaction' : 'budget item'})</small>
          </li>
        ))}
      </ul>
      {visit.current && controller?.requiresPin ? (
        <button onClick={() => controller.lock()}>Lock Finance</button>
      ) : null}
    </section>
  );
}
