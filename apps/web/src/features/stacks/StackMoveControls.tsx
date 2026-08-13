import { useEffect, useState } from 'react';
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
}: {
  work: WorkReference;
  label: string;
  position: number;
  total: number;
  move: StackMoveHandler;
}) {
  const [targetPosition, setTargetPosition] = useState(position);
  const [positionEditorOpen, setPositionEditorOpen] = useState(false);
  const focusId = stackRowFocusId(work);
  const positionInputId = `${focusId}-position`;

  useEffect(() => setTargetPosition(position), [position]);

  const requestMove = async (destination: number) => {
    const bounded = boundedPosition(destination, total);
    setTargetPosition(bounded);
    try {
      await move(work, bounded);
    } finally {
      document.getElementById(focusId)?.focus();
    }
  };

  return (
    <div className="stack-move-controls" aria-label={`Reorder ${label}`}>
      <button
        type="button"
        aria-label="Move up"
        aria-controls={focusId}
        data-focus-return={focusId}
        data-touch-alternative="true"
        disabled={position <= 1}
        onClick={() => void requestMove(position - 1)}
      >
        Move up
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
        Move down
      </button>
      <button
        type="button"
        aria-controls={positionInputId}
        data-touch-alternative="true"
        onClick={() => setPositionEditorOpen(true)}
      >
        Move to position
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
          <span>New position</span>
          <input
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
          Apply position
        </button>
      </form>
    </div>
  );
}
