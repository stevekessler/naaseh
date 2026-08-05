import { useEffect, useState } from 'react';
import type { LocalStackScope } from '../../db/personal-stack-repository.js';
import { StackRow, type StackDisplayItem } from './StackRow.js';
import type { StackMoveHandler } from './StackMoveControls.js';

export const MAXIMUM_RENDERED_STACK_ROWS = 100;
export const maximumRenderedStackRows = MAXIMUM_RENDERED_STACK_ROWS;

const boundedWindowSize = (requested: number) =>
  Math.max(1, Math.min(MAXIMUM_RENDERED_STACK_ROWS, Math.trunc(requested)));

export function StackList({
  items,
  scope,
  move,
  windowSize = MAXIMUM_RENDERED_STACK_ROWS,
  initialStartIndex = 0,
}: {
  items: readonly StackDisplayItem[];
  scope: LocalStackScope;
  move: StackMoveHandler;
  windowSize?: number;
  initialStartIndex?: number;
}) {
  const size = boundedWindowSize(windowSize);
  const lastStart = Math.max(0, items.length - size);
  const [startIndex, setStartIndex] = useState(
    Math.max(0, Math.min(lastStart, Math.trunc(initialStartIndex))),
  );

  useEffect(() => setStartIndex((current) => Math.min(current, lastStart)), [lastStart]);

  if (!items.length) {
    return (
      <div className="empty" role="status">
        <h2>No work in this stack.</h2>
        <p>Authorized active to-dos and Lists will appear here.</p>
      </div>
    );
  }

  const endIndex = Math.min(items.length, startIndex + size);
  const window = items.slice(startIndex, endIndex);
  const positions = items.map((item) =>
    scope.scopeType === 'overall' ? item.overallPosition : item.projectPosition,
  );
  const hasCompleteDenseScope = positions.every((position, index) => position === index + 1);
  return (
    <section className="stack-list-window" aria-label="Personal stack" data-virtualized="true">
      <p className="stack-window-status">
        Showing positions {startIndex + 1}–{endIndex} of {items.length}
      </p>
      <button
        type="button"
        disabled={startIndex === 0}
        onClick={() => setStartIndex(Math.max(0, startIndex - size))}
      >
        Show previous stack items
      </button>
      <ol className="stack-list" start={startIndex + 1} data-window-size={size}>
        {window.map((item, index) => (
          <StackRow
            key={`${item.reference.workType}:${item.reference.workId}:${item.reference.membershipEpoch}`}
            item={item}
            scope={scope}
            {...(hasCompleteDenseScope ? { total: items.length } : {})}
            movePosition={startIndex + index + 1}
            moveTotal={items.length}
            ariaPosition={startIndex + index + 1}
            ariaTotal={items.length}
            move={move}
          />
        ))}
      </ol>
      <button
        type="button"
        disabled={endIndex >= items.length}
        onClick={() => setStartIndex(Math.min(lastStart, startIndex + size))}
      >
        Show next stack items
      </button>
    </section>
  );
}
