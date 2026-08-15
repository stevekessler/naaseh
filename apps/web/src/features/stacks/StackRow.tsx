import type { Urgency, WorkReference } from '@naaseh/domain';
import { useSortable } from '@dnd-kit/react/sortable';
import { UrgencyBadge } from '../../components/UrgencyBadge.js';
import type { LocalStackScope } from '../../db/personal-stack-repository.js';
import { StackMoveControls, stackRowFocusId, type StackMoveHandler } from './StackMoveControls.js';

export { stackRowFocusId } from './StackMoveControls.js';

export interface StackDisplayItem {
  reference: WorkReference;
  label: string;
  urgency: Urgency;
  overallPosition: number;
  projectPosition?: number;
  pending?: boolean;
}

export const stackDragId = (reference: WorkReference) =>
  `${reference.workType}:${reference.workId}:${reference.membershipEpoch}`;

export function StackRow({
  item,
  scope,
  total,
  movePosition,
  moveTotal,
  ariaPosition,
  ariaTotal,
  move,
  editTask,
  dragIndex,
  dragGroup,
}: {
  item: StackDisplayItem;
  scope: LocalStackScope;
  total?: number | undefined;
  movePosition?: number | undefined;
  moveTotal?: number | undefined;
  ariaPosition?: number | undefined;
  ariaTotal?: number | undefined;
  move: StackMoveHandler;
  editTask?: ((taskId: string) => void) | undefined;
  dragIndex?: number;
  dragGroup?: string;
}) {
  const selectedPosition =
    scope.scopeType === 'overall' ? item.overallPosition : item.projectPosition;
  if (selectedPosition === undefined) return null;

  return dragIndex === undefined || dragGroup === undefined ? (
    <StackRowContent
      item={item}
      scope={scope}
      selectedPosition={selectedPosition}
      {...{ total, movePosition, moveTotal, ariaPosition, ariaTotal, move, editTask }}
    />
  ) : (
    <SortableStackRow
      item={item}
      scope={scope}
      selectedPosition={selectedPosition}
      dragIndex={dragIndex}
      dragGroup={dragGroup}
      {...{ total, movePosition, moveTotal, ariaPosition, ariaTotal, move, editTask }}
    />
  );
}

type RowContentProps = Parameters<typeof StackRow>[0] & {
  selectedPosition: number;
  rowRef?: (element: Element | null) => void;
  handleRef?: (element: Element | null) => void;
  dragging?: boolean;
  dropTarget?: boolean;
};

function SortableStackRow(props: RowContentProps & { dragIndex: number; dragGroup: string }) {
  const { ref, handleRef, isDragging, isDropTarget } = useSortable({
    id: stackDragId(props.item.reference),
    index: props.dragIndex,
    group: props.dragGroup,
    type: 'stack-row',
    data: { reference: props.item.reference },
  });
  return (
    <StackRowContent
      {...props}
      rowRef={ref}
      handleRef={handleRef}
      dragging={isDragging}
      dropTarget={isDropTarget}
    />
  );
}

function StackRowContent({
  item,
  scope,
  total,
  movePosition,
  moveTotal,
  ariaPosition,
  ariaTotal,
  move,
  editTask,
  selectedPosition,
  rowRef,
  handleRef,
  dragging = false,
  dropTarget = false,
}: RowContentProps) {
  return (
    <li
      ref={rowRef}
      id={stackRowFocusId(item.reference)}
      className={`stack-row${dragging ? ' stack-row--dragging' : ''}${dropTarget ? ' stack-row--drop-target' : ''}`}
      tabIndex={-1}
      aria-posinset={ariaPosition ?? selectedPosition}
      aria-setsize={ariaTotal ?? total}
      data-work-type={item.reference.workType}
    >
      <div className="stack-row-summary">
        {handleRef ? (
          <button
            ref={handleRef}
            type="button"
            className="stack-drag-handle"
            aria-label={`Drag ${item.label}`}
            aria-describedby="stack-drag-instructions"
          >
            <span aria-hidden="true">⋮⋮</span>
          </button>
        ) : null}
        <span className="stack-work-type">
          {item.reference.workType === 'task' ? 'To-do' : 'List'}
        </span>
        <h2>{item.label}</h2>
        <UrgencyBadge urgency={item.urgency} mode="compact" />
        {item.reference.workType === 'task' && editTask ? (
          <button
            id={`task-edit-trigger-stack-${item.reference.workId}`}
            type="button"
            className="quiet"
            onClick={() => editTask(item.reference.workId)}
          >
            Edit {item.label}
          </button>
        ) : null}
        <p className="stack-ranks">
          {scope.scopeType === 'project' ? (
            <>
              <span>
                Project position {selectedPosition}
                {total === undefined ? null : ` of ${total}`}
              </span>{' '}
              <span>Overall position {item.overallPosition}</span>
            </>
          ) : (
            <>
              <span>
                Overall position {selectedPosition}
                {total === undefined ? null : ` of ${total}`}
              </span>{' '}
              {item.projectPosition === undefined ? null : (
                <span>Project position {item.projectPosition}</span>
              )}
            </>
          )}
        </p>
        {item.pending ? <p className="stack-pending">Pending synchronization</p> : null}
      </div>
      <StackMoveControls
        work={item.reference}
        label={item.label}
        position={movePosition ?? selectedPosition}
        total={moveTotal ?? total ?? selectedPosition}
        move={move}
      />
    </li>
  );
}
