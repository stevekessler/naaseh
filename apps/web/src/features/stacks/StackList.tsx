import { useEffect, useRef, useState } from 'react';
import { DragDropProvider, PointerSensor, type DragEndEvent } from '@dnd-kit/react';
import type { LocalStackScope } from '../../db/personal-stack-repository.js';
import { stackDragId, StackRow, type StackDisplayItem } from './StackRow.js';
import type { StackMoveHandler } from './StackMoveControls.js';

export const MAXIMUM_RENDERED_STACK_ROWS = 100;
export const maximumRenderedStackRows = MAXIMUM_RENDERED_STACK_ROWS;

const boundedWindowSize = (requested: number) =>
  Math.max(1, Math.min(MAXIMUM_RENDERED_STACK_ROWS, Math.trunc(requested)));

export function resolveVisibleStackDrop(
  items: readonly StackDisplayItem[],
  sourceId: string | undefined,
  targetId: string | undefined,
  startIndex = 0,
) {
  const sourceIndex = items.findIndex((item) => stackDragId(item.reference) === sourceId);
  const targetIndex = items.findIndex((item) => stackDragId(item.reference) === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return undefined;
  return { work: items[sourceIndex]!.reference, destinationPosition: startIndex + targetIndex + 1 };
}

export function StackList({
  items,
  scope,
  move,
  windowSize = MAXIMUM_RENDERED_STACK_ROWS,
  initialStartIndex = 0,
  editTask,
}: {
  items: readonly StackDisplayItem[];
  scope: LocalStackScope;
  move: StackMoveHandler;
  windowSize?: number;
  initialStartIndex?: number;
  editTask?: (taskId: string) => void;
}) {
  const size = boundedWindowSize(windowSize);
  const lastStart = Math.max(0, items.length - size);
  const [startIndex, setStartIndex] = useState(
    Math.max(0, Math.min(lastStart, Math.trunc(initialStartIndex))),
  );
  const lastDragTarget = useRef<string | undefined>(undefined);

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
  const dragGroup =
    scope.scopeType === 'overall'
      ? 'personal-stack:overall'
      : `personal-stack:project:${scope.scopeId}`;
  const finishDrag = (event: DragEndEvent) => {
    if (event.canceled || !event.operation.source || !event.operation.target) return;
    const resolved = resolveVisibleStackDrop(
      window,
      String(event.operation.source.id),
      lastDragTarget.current ?? String(event.operation.target.id),
      startIndex,
    );
    lastDragTarget.current = undefined;
    if (resolved) void move(resolved.work, resolved.destinationPosition);
  };
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
      <p id="stack-drag-instructions" className="visually-hidden">
        Drag to another visible position. Use the move controls for keyboard or long-distance moves.
      </p>
      <DragDropProvider
        sensors={[PointerSensor]}
        onDragStart={() => {
          lastDragTarget.current = undefined;
        }}
        onDragOver={(event) => {
          const sourceId = event.operation.source?.id;
          const targetId = event.operation.target?.id;
          if (targetId !== undefined && targetId !== sourceId)
            lastDragTarget.current = String(targetId);
        }}
        onDragEnd={finishDrag}
      >
        <ol className="stack-list" start={startIndex + 1} data-window-size={size}>
          {window.map((item, index) => (
            <StackRow
              key={stackDragId(item.reference)}
              item={item}
              scope={scope}
              dragIndex={index}
              dragGroup={dragGroup}
              {...(hasCompleteDenseScope ? { total: items.length } : {})}
              movePosition={startIndex + index + 1}
              moveTotal={items.length}
              ariaPosition={startIndex + index + 1}
              ariaTotal={items.length}
              move={move}
              {...(editTask ? { editTask } : {})}
            />
          ))}
        </ol>
      </DragDropProvider>
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
