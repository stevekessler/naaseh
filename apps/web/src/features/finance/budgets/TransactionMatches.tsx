import { FormEvent, useState } from 'react';
import { financeRequest } from '../finance-client.js';

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

export function TransactionMatches({ csrfToken }: { csrfToken: string }) {
  const [transactionId, setTransactionId] = useState('');
  const [transactionVersion, setTransactionVersion] = useState(1);
  const [matches, setMatches] = useState<MatchView[]>([]);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');

  const load = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setPreview('');
    try {
      const page = await financeRequest<{ items: MatchView[]; transactionVersion?: number }>(
        `/finance/transactions/${encodeURIComponent(transactionId)}/matches`,
      );
      setMatches(page.items);
      setTransactionVersion(page.transactionVersion ?? 1);
    } catch {
      setError('Match suggestions could not be loaded.');
    }
  };

  const decide = async (match: MatchView, decision: 'accept' | 'reject' | 'undo') => {
    setError('');
    try {
      const updated = await financeRequest<MatchView>(`/finance/matches/${match.id}/decision`, {
        method: 'POST',
        csrfToken,
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({
          decision,
          expectedVersion: match.version,
          expectedTransactionVersion: transactionVersion,
        }),
      });
      setMatches((current) =>
        current.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      );
      setTransactionVersion((version) => (decision === 'reject' ? version : version + 1));
    } catch {
      setError('The match changed elsewhere. Refresh before deciding.');
    }
  };

  const previewRemoval = async (match: MatchView) => {
    try {
      const result = await financeRequest<{ outcome: string }>(
        `/finance/records/match/${match.id}/deletion-preview`,
      );
      setPreview(
        `Removing this match will ${result.outcome === 'tombstone' ? 'preserve an audit tombstone' : result.outcome}.`,
      );
    } catch {
      setError('The match impact preview is unavailable.');
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
            onChange={(event) => setTransactionId(event.target.value)}
            required
          />
        </label>
        <button type="submit">Review matches</button>
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
                <button onClick={() => void decide(match, 'accept')}>Accept match</button>
                <button onClick={() => void decide(match, 'reject')}>Reject match</button>
              </>
            ) : null}
            {match.status === 'accepted' ? (
              <button onClick={() => void decide(match, 'undo')}>Undo match</button>
            ) : null}
            <button onClick={() => void previewRemoval(match)}>Preview match removal</button>
          </article>
        ))}
      </div>
    </section>
  );
}
