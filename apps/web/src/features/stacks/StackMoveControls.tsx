import { useEffect, useRef, useState } from 'react';
import type { WorkReference } from '@naaseh/domain';

export const stackRowFocusId = (work: WorkReference) =>
  `personal-stack-row-${work.workType}-${work.workId}`;

export type StackMoveHandler = (
  work: WorkReference,
  destinationPosition: number,
) => void | Promise<void>;

const boundedPosition = (position: number, total: number) =>
  Math.max(1, Math.min(total, Math.trunc(position)));

export function StackMoveControls({
  work,
  label,
  position,
  total,
  move,
  compact = false,
}: {
  work: WorkReference;
  label: string;
  position: number;
  total: number;
  move: StackMoveHandler;
  compact?: boolean;
}) {
  const [targetPosition, setTargetPosition] = useState(position);
  const [positionEditorOpen, setPositionEditorOpen] = useState(false);
  const positionInputRef = useRef<HTMLInputElement>(null);
  const focusId = stackRowFocusId(work);
  const positionInputId = `${focusId}-position`;

  useEffect(() => setTargetPosition(position), [position]);
  useEffect(() => {
    if (!positionEditorOpen) return;
    positionInputRef.current?.focus();
    positionInputRef.current?.select();
  }, [positionEditorOpen]);

  const requestMove = async (destination: number) => {
    const bounded = boundedPosition(destination, total);
    setTargetPosition(bounded);
    setPositionEditorOpen(false);
    try {
      await move(work, bounded);
    } finally {
      // The sortable row is replaced after a local reorder. Restore focus
      // after React commits the new table row, not on the outgoing element.
      requestAnimationFrame(() => document.getElementById(focusId)?.focus());
    }
  };

  return (
    <div className="stack-move-controls" role="group" aria-label={`Reorder ${label}`}>
      <button
        type="button"
        aria-label="Move up"
        aria-controls={focusId}
        data-focus-return={focusId}
        data-touch-alternative="true"
        disabled={position <= 1}
        onClick={() => void requestMove(position - 1)}
      >
        {compact ? '↑' : 'Move up'}
      </button>
      <button
        type="button"
        aria-label="Move down"
        aria-controls={focusId}
        data-focus-return={focusId}
        data-touch-alternative="true"
        disabled={position >= total}
        onClick={() => void requestMove(position + 1)}
      >
        {compact ? '↓' : 'Move down'}
      </button>
      <button
        type="button"
        className="stack-position-toggle"
        aria-label="Move to position"
        aria-controls={positionInputId}
        aria-expanded={positionEditorOpen}
        data-touch-alternative="true"
        onClick={() => setPositionEditorOpen((open) => !open)}
      >
        {compact ? 'Move to…' : 'Move to position…'}
      </button>
      <form
        className="stack-position-editor"
        hidden={!positionEditorOpen}
        onSubmit={(event) => {
          event.preventDefault();
          void requestMove(targetPosition);
        }}
      >
        <label>
          <span>
            New position <small>(1–{total})</small>
          </span>
          <input
            ref={positionInputRef}
            id={positionInputId}
            type="number"
            inputMode="numeric"
            min={1}
            max={total}
            value={targetPosition}
            aria-label="Position"
            onChange={(event) => setTargetPosition(event.currentTarget.valueAsNumber || 1)}
          />
        </label>
        <button
          type="submit"
          aria-controls={focusId}
          data-focus-return={focusId}
          data-touch-alternative="true"
        >
          Move
        </button>
        <button type="button" className="quiet" onClick={() => setPositionEditorOpen(false)}>
          Cancel
        </button>
      </form>
    </div>
  );
}
