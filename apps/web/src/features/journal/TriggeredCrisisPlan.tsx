import type { JournalDocument } from '@naaseh/domain';
import { JournalRichTextView } from './JournalRichTextView.js';

export function TriggeredCrisisPlan({
  document,
  error,
  onRetry,
  onEdit,
}: {
  document: JournalDocument | null;
  error?: string;
  onRetry?: () => void;
  onEdit?: () => void;
}) {
  return (
    <aside
      className="triggered-crisis-plan"
      role="region"
      aria-labelledby="triggered-crisis-plan-title"
      aria-live="polite"
    >
      <h3 id="triggered-crisis-plan-title">Your Crisis Plan</h3>
      {document ? (
        <JournalRichTextView document={document} />
      ) : (
        <p>{error ?? 'Loading your encrypted Crisis Plan…'}</p>
      )}
      {error && onRetry && (
        <button type="button" onClick={onRetry}>
          Retry Crisis Plan
        </button>
      )}
      {onEdit && (
        <button type="button" onClick={onEdit}>
          Edit Crisis Plan
        </button>
      )}
    </aside>
  );
}
