import { useEffect, useRef, useState } from 'react';
import {
  FinanceTransactionIndex,
  registerFinanceSearchIndex,
  type FinanceIndexProgress,
  type FinanceSearchDocument,
} from '../../../search/finance-index.js';

export function TransactionSearch({
  accounts,
  documents,
  onMatches,
}: {
  accounts: ReadonlyArray<{ id: string; friendlyName: string }>;
  documents: readonly FinanceSearchDocument[];
  onMatches: (ids: string[]) => void;
}) {
  const index = useRef(new FinanceTransactionIndex());
  const [scope, setScope] = useState('all');
  const [query, setQuery] = useState('');
  const [progress, setProgress] = useState<FinanceIndexProgress>({
    indexed: 0,
    total: documents.length,
    complete: false,
  });
  useEffect(() => registerFinanceSearchIndex(index.current), []);
  useEffect(() => {
    let active = true;
    void index.current.replaceProgressively(documents, {
      onProgress: (next) => {
        if (active) setProgress(next);
      },
    });
    return () => {
      active = false;
      index.current.clear();
    };
  }, [documents]);
  useEffect(() => {
    onMatches(index.current.search(query, { ...(scope === 'all' ? {} : { accountId: scope }) }));
  }, [onMatches, progress.indexed, query, scope]);
  return (
    <div className="finance-transaction-filters">
      <label>
        Account scope
        <select value={scope} onChange={(event) => setScope(event.target.value)}>
          <option value="all">All accessible accounts</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.friendlyName}
            </option>
          ))}
        </select>
      </label>
      <label>
        Search transactions
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {!progress.complete ? (
        <p role="status">
          Indexing transactions… {progress.indexed} of {progress.total}
        </p>
      ) : null}
    </div>
  );
}
