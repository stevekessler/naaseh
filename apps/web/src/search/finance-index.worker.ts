import { localFinanceDate } from '@naaseh/domain';
import type { FinanceQueryFilters } from '@naaseh/contracts';
import type { FinanceBrowseDocument, FinanceWorkerRequest } from './finance-index.js';

const normalize = (value: string) =>
  value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/gu, ' ').trim();
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function matches(row: FinanceBrowseDocument, filters: FinanceQueryFilters) {
  if (filters.accountIds?.length && !filters.accountIds.includes(row.accountId)) return false;
  const accountName = normalize(filters.accountName ?? '');
  if (accountName && !row.accountNames.some((name) => normalize(name).includes(accountName)))
    return false;
  if (filters.currency && row.currency !== filters.currency) return false;
  if (filters.checkNumber && row.checkNumber !== filters.checkNumber) return false;
  if (filters.amount !== undefined && row.amountMinor !== filters.amount) return false;
  if (filters.amountMin !== undefined && row.amountMinor < filters.amountMin) return false;
  if (filters.amountMax !== undefined && row.amountMinor > filters.amountMax) return false;
  if (
    filters.text &&
    !normalize(
      [row.description, row.payee, row.memo, row.merchantName].filter(Boolean).join(' '),
    ).includes(normalize(filters.text))
  )
    return false;
  if (filters.date || filters.dateFrom || filters.dateTo) {
    const day = localFinanceDate(row.effectiveAt, filters.timeZone);
    if (filters.date && day !== filters.date) return false;
    if (filters.dateFrom && day < filters.dateFrom) return false;
    if (filters.dateTo && day > filters.dateTo) return false;
  }
  return true;
}

let generation = 0;
self.onmessage = ({ data }: MessageEvent<FinanceWorkerRequest>) => {
  const current = ++generation;
  const { documents, filters } = data;
  void (async () => {
    const hits: FinanceBrowseDocument[] = [];
    for (let start = 0; start < documents.length; start += 500) {
      if (current !== generation) return;
      hits.push(...documents.slice(start, start + 500).filter((row) => matches(row, filters)));
      self.postMessage({
        progress: {
          indexed: Math.min(start + 500, documents.length),
          total: documents.length,
          complete: false,
        },
      });
      await pause();
    }
    if (current !== generation) return;
    hits.sort(
      (left, right) =>
        Date.parse(right.effectiveAt) - Date.parse(left.effectiveAt) ||
        right.id.localeCompare(left.id),
    );
    self.postMessage({
      ids: hits.map(({ id }) => id),
      progress: { indexed: documents.length, total: documents.length, complete: true },
    });
  })();
};
