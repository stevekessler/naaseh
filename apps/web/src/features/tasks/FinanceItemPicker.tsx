import { useEffect, useMemo, useState } from 'react';
import { db } from '../../db/database.js';
import { decryptFinanceRecord, financeDeviceKey } from '../../db/finance-repository.js';
import { readFinanceCachedData } from '../../sync/finance-cache-access.js';
import { peekFinanceAccess, subscribeFinanceAccess } from '../finance/security/finance-access.js';

export type FinanceLinkSelection =
  | { targetType: 'budgetItem'; targetId: string; budgetId: string }
  | { targetType: 'transaction' | 'upcomingExpense'; targetId: string };

export type FinanceItemOption = FinanceLinkSelection & { label: string; context?: string };

const keyOf = (value: FinanceLinkSelection) => `${value.targetType}#${value.targetId}`;
const selectionOf = (option: FinanceItemOption): FinanceLinkSelection =>
  option.targetType === 'budgetItem'
    ? { targetType: option.targetType, targetId: option.targetId, budgetId: option.budgetId }
    : { targetType: option.targetType, targetId: option.targetId };

export async function readLocalFinanceItemOptions(): Promise<FinanceItemOption[]> {
  return readFinanceCachedData(async (lease) => {
    const groups = await Promise.all(
      ['financeTransaction', 'financeUpcomingExpense', 'financeBudgetItem'].map((entityType) =>
        db.secureFinanceRecords.where('entityType').equals(entityType).limit(50).toArray(),
      ),
    );
    const key = await financeDeviceKey();
    const values = await Promise.all(
      groups.flat().map(async (record) => ({
        entityType: record.entityType,
        value: await decryptFinanceRecord(record, key, lease) as Record<string, unknown>,
      })),
    );
    return values.flatMap<FinanceItemOption>(({ entityType, value }) => {
      if (typeof value.id !== 'string' || ['removed', 'archived', 'tombstone'].includes(String(value.status)))
        return [];
      const label = String(value.description ?? 'Finance record');
      if (entityType === 'financeTransaction')
        return [{ targetType: 'transaction' as const, targetId: value.id, label, context: 'Transaction' }];
      if (entityType === 'financeUpcomingExpense')
        return [{ targetType: 'upcomingExpense' as const, targetId: value.id, label, context: 'Upcoming expense' }];
      return typeof value.budgetId === 'string'
        ? [{ targetType: 'budgetItem' as const, targetId: value.id, budgetId: value.budgetId,
            label, context: 'Budget item' }]
        : [];
    });
  });
}

export function useFinanceItemOptions() {
  const [options, setOptions] = useState<FinanceItemOption[]>([]);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      setOptions([]);
      if (!peekFinanceAccess()?.canRead()) return;
      void readLocalFinanceItemOptions().then((value) => { if (active) setOptions(value); }).catch(() => undefined);
    };
    const unsubscribe = subscribeFinanceAccess(refresh);
    refresh();
    return () => { active = false; unsubscribe(); };
  }, []);
  return options;
}

export function FinanceItemPicker({
  options,
  value,
  onChange,
  locked = false,
  onUnlock,
}: {
  options: readonly FinanceItemOption[];
  value: readonly FinanceLinkSelection[];
  onChange: (value: FinanceLinkSelection[]) => void;
  locked?: boolean;
  onUnlock?: () => void;
}) {
  const [query, setQuery] = useState('');
  const selected = useMemo(() => new Set(value.map(keyOf)), [value]);
  const visible = options.filter((option) =>
    `${option.label} ${option.context ?? ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  if (locked)
    return (
      <section aria-label="Related Finance records">
        <p>Finance is locked.</p>
        {onUnlock ? <button type="button" onClick={onUnlock}>Unlock Finance</button> : null}
      </section>
    );
  return (
    <fieldset className="finance-item-picker">
      <legend>Related Finance records (optional)</legend>
      <label>
        Find a transaction, upcoming expense, or budget item
        <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" />
      </label>
      <div className="finance-item-picker-options">
        {visible.map((option) => {
          const key = keyOf(option);
          return (
            <label key={key}>
              <input
                type="checkbox"
                checked={selected.has(key)}
                onChange={() =>
                  onChange(
                    selected.has(key)
                      ? value.filter((candidate) => keyOf(candidate) !== key)
                      : [...value, selectionOf(option)],
                  )
                }
              />
              <span>{option.label}</span>
              {option.context ? <small>{option.context}</small> : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
