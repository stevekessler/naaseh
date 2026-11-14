import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { financeRequest } from '../finance-client.js';
import { peekFinanceAccess } from '../security/finance-access.js';
import {
  disposeFinanceApiSnapshot,
  loadFinanceApiSnapshot,
  readFinanceApiSnapshot,
  type FinanceApiSnapshot,
} from '../../../sync/finance-api-snapshot.js';

interface MatchView {
  id: string;
  transactionId: string;
  budgetItemId: string;
  kind: 'exact' | 'near' | 'manual';
  scoreBasis: {
    merchant: boolean;
    date: boolean;
    account: boolean;
    amountDifferencePercent: number;
  };
  status: 'suggested' | 'accepted' | 'rejected' | 'undone' | 'invalidated' | 'tombstone';
  version: number;
}

interface MatchPage {
  items: MatchView[];
  transactionVersion?: number;
}
interface MatchSnapshot extends MatchPage {
  transactionId: string;
}

export function TransactionMatches({ csrfToken }: { csrfToken: string }) {
  const [transactionId, setTransactionId] = useState('');
  const [matches, setMatches] = useState<MatchView[]>([]);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');

  const [pending, setPending] = useState(false);
  const snapshot = useRef<FinanceApiSnapshot<MatchSnapshot> | undefined>(undefined);
  const previewSnapshot = useRef<FinanceApiSnapshot<{ outcome: string }> | undefined>(undefined);
  const visit = useRef(0),
    serial = useRef(0);
  const clearResults = useCallback(() => {
    visit.current++;
    serial.current++;
    if (snapshot.current) disposeFinanceApiSnapshot(snapshot.current);
    if (previewSnapshot.current) disposeFinanceApiSnapshot(previewSnapshot.current);
    snapshot.current = undefined;
    previewSnapshot.current = undefined;
    setTransactionId('');
    setMatches([]);
    setPreview('');
    setError('');
    setPending(false);
  }, []);
  useEffect(() => {
    const unsubscribe = peekFinanceAccess()?.onLock(() => {
      clearResults();
      setTransactionId('');
      setError('Refresh Finance before reviewing matches.');
    });
    return () => {
      unsubscribe?.();
      visit.current++;
      serial.current++;
      if (snapshot.current) disposeFinanceApiSnapshot(snapshot.current);
      if (previewSnapshot.current) disposeFinanceApiSnapshot(previewSnapshot.current);
      snapshot.current = undefined;
      previewSnapshot.current = undefined;
    };
  }, [clearResults]);

  const loadPage = async (id: string, expectedVisit: number) => {
    if (expectedVisit !== visit.current) return;
    const current = ++serial.current;
    setPending(true);
    setError('');
    setPreview('');
    setMatches([]);
    if (previewSnapshot.current) disposeFinanceApiSnapshot(previewSnapshot.current);
    previewSnapshot.current = undefined;
    let retained: FinanceApiSnapshot<MatchSnapshot> | undefined;
    try {
      retained = await loadFinanceApiSnapshot(async (request) => ({
        ...(await request<MatchPage>(`/finance/transactions/${encodeURIComponent(id)}/matches`)),
        transactionId: id,
      }));
      if (expectedVisit !== visit.current || current !== serial.current) {
        disposeFinanceApiSnapshot(retained);
        return;
      }
      const page = await readFinanceApiSnapshot(retained, (value) => value);
      if (expectedVisit !== visit.current || current !== serial.current) {
        disposeFinanceApiSnapshot(retained);
        return;
      }
      if (snapshot.current) disposeFinanceApiSnapshot(snapshot.current);
      snapshot.current = retained;
      setMatches(page.items);
      setPending(false);
    } catch {
      if (retained) disposeFinanceApiSnapshot(retained);
      if (expectedVisit === visit.current && current === serial.current) {
        clearResults();
        setError('Refresh Finance before reviewing matches.');
      }
    }
  };
  const load = async (event: FormEvent) => {
    event.preventDefault();
    await loadPage(transactionId, visit.current);
  };
  const checkedMatch = async (match: MatchView) => {
    const retained = snapshot.current,
      current = visit.current,
      requestSerial = serial.current;
    if (!retained) return undefined;
    try {
      const value = await readFinanceApiSnapshot(retained, (page) => {
        const record = page.items.find(
          (candidate) => candidate.id === match.id && candidate.version === match.version,
        );
        return record
          ? {
              record,
              transactionId: page.transactionId,
              transactionVersion: page.transactionVersion ?? 1,
            }
          : undefined;
      });
      return current === visit.current &&
        requestSerial === serial.current &&
        retained === snapshot.current
        ? value
        : undefined;
    } catch {
      if (current === visit.current && requestSerial === serial.current) {
        clearResults();
        setError('Refresh Finance before reviewing matches.');
      }
      return undefined;
    }
  };
  const decide = async (match: MatchView, decision: 'accept' | 'reject' | 'undo') => {
    const current = visit.current;
    setError('');
    setPending(true);
    const checked = await checkedMatch(match);
    if (!checked || current !== visit.current) {
      if (current === visit.current) setPending(false);
      return;
    }
    try {
      await financeRequest(`/finance/matches/${checked.record.id}/decision`, {
        method: 'POST',
        csrfToken,
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({
          decision,
          expectedVersion: checked.record.version,
          expectedTransactionVersion: checked.transactionVersion,
        }),
      });
      if (current === visit.current) await loadPage(checked.transactionId, current);
    } catch {
      if (current === visit.current) {
        clearResults();
        setError('The match changed elsewhere. Refresh before deciding.');
      }
    }
  };
  const previewRemoval = async (match: MatchView) => {
    const current = visit.current;
    setError('');
    setPreview('');
    setPending(true);
    const checked = await checkedMatch(match);
    if (!checked || current !== visit.current) {
      if (current === visit.current) setPending(false);
      return;
    }
    const requestSerial = serial.current;
    let retained: FinanceApiSnapshot<{ outcome: string }> | undefined;
    try {
      retained = await loadFinanceApiSnapshot((request) =>
        request<{ outcome: string }>(
          `/finance/records/match/${checked.record.id}/deletion-preview`,
        ),
      );
      if (current !== visit.current || requestSerial !== serial.current) {
        disposeFinanceApiSnapshot(retained);
        return;
      }
      const result = await readFinanceApiSnapshot(retained, (value) => value);
      if (current !== visit.current || requestSerial !== serial.current) {
        disposeFinanceApiSnapshot(retained);
        return;
      }
      if (previewSnapshot.current) disposeFinanceApiSnapshot(previewSnapshot.current);
      previewSnapshot.current = retained;
      setPreview(
        `Removing this match will ${result.outcome === 'tombstone' ? 'preserve an audit tombstone' : result.outcome}.`,
      );
      setPending(false);
    } catch {
      if (retained) disposeFinanceApiSnapshot(retained);
      if (current === visit.current && requestSerial === serial.current) {
        clearResults();
        setError('The match impact preview is unavailable.');
      }
    }
  };

  return (
    <section className="finance-transaction-matches" aria-labelledby="transaction-match-heading">
      <h3 id="transaction-match-heading">Transaction match review</h3>
      <form onSubmit={(event) => void load(event)}>
        <label>
          Transaction for match review
          <input
            value={transactionId}
            onChange={(event) => {
              clearResults();
              setTransactionId(event.target.value);
            }}
            required
          />
        </label>
        <button type="submit" disabled={pending}>
          Review matches
        </button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {preview ? <p role="status">{preview}</p> : null}
      <div className="finance-match-list">
        {matches.map((match) => (
          <article
            key={match.id}
            aria-label={`${match.kind === 'near' ? 'Near' : match.kind === 'exact' ? 'Exact' : 'Manual'} match suggestion`}
          >
            <h4>
              {match.kind === 'exact'
                ? 'Exact match'
                : match.kind === 'near'
                  ? 'Near match'
                  : 'Manual match'}
            </h4>
            <p>
              {match.kind === 'exact'
                ? 'Unique merchant, account, date, and amount match'
                : `${match.scoreBasis.amountDifferencePercent}% amount difference`}
            </p>
            <p>Status: {match.status}</p>
            {match.status === 'suggested' || match.status === 'undone' ? (
              <>
                <button disabled={pending} onClick={() => void decide(match, 'accept')}>
                  Accept match
                </button>
                <button disabled={pending} onClick={() => void decide(match, 'reject')}>
                  Reject match
                </button>
              </>
            ) : null}
            {match.status === 'accepted' ? (
              <button disabled={pending} onClick={() => void decide(match, 'undo')}>
                Undo match
              </button>
            ) : null}
            <button disabled={pending} onClick={() => void previewRemoval(match)}>
              Preview match removal
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
