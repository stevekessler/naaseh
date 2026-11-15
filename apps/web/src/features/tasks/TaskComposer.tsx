import { useState, type FormEvent } from 'react';
import {
  FinanceItemPicker,
  type FinanceItemOption,
  type FinanceLinkSelection,
} from './FinanceItemPicker.js';
export function TaskComposer({
  onAdd,
  financeOptions = [],
  financeLocked = false,
  onUnlockFinance,
}: {
  onAdd: (
    label: string,
    memo: string,
    dueAt?: string,
    financeLinkSelections?: FinanceLinkSelection[],
  ) => Promise<void>;
  financeOptions?: readonly FinanceItemOption[];
  financeLocked?: boolean;
  onUnlockFinance?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [financeLinkSelections, setFinanceLinkSelections] = useState<FinanceLinkSelection[]>([]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const due = String(data.get('dueAt') ?? '');
    await onAdd(
      String(data.get('label')),
      String(data.get('memo') ?? ''),
      due || undefined,
      financeLinkSelections.length ? financeLinkSelections : undefined,
    );
    form.reset();
    setFinanceLinkSelections([]);
    setExpanded(false);
  }
  return (
    <form className="composer" onSubmit={submit}>
      <input
        name="label"
        aria-label="Task label"
        placeholder="What needs doing?"
        required
        onFocus={() => setExpanded(true)}
      />
      {expanded && (
        <>
          <textarea name="memo" aria-label="Memo" placeholder="Add a memo" />
          <label>
            <span>Due</span>
            <input name="dueAt" type="datetime-local" />
          </label>
          {financeOptions.length || financeLocked ? (
            <FinanceItemPicker
              options={financeOptions}
              value={financeLinkSelections}
              onChange={setFinanceLinkSelections}
              locked={financeLocked}
              {...(onUnlockFinance ? { onUnlock: onUnlockFinance } : {})}
            />
          ) : null}
          <div className="composer-actions">
            <button
              type="button"
              className="quiet"
              onClick={() => {
                setExpanded(false);
                setFinanceLinkSelections([]);
              }}
            >
              Cancel
            </button>
            <button type="submit">Add task</button>
          </div>
        </>
      )}
    </form>
  );
}
