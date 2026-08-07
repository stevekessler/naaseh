import type { Urgency, WorkReference } from '@naaseh/domain';
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

export function StackRow({
  item,
  scope,
  total,
  movePosition,
  moveTotal,
  ariaPosition,
  ariaTotal,
  move,
}: {
  item: StackDisplayItem;
  scope: LocalStackScope;
  total?: number;
  movePosition?: number;
  moveTotal?: number;
  ariaPosition?: number;
  ariaTotal?: number;
  move: StackMoveHandler;
}) {
  const selectedPosition =
    scope.scopeType === 'overall' ? item.overallPosition : item.projectPosition;
  if (selectedPosition === undefined) return null;

  return (
    <li
      id={stackRowFocusId(item.reference)}
      className="stack-row"
      tabIndex={-1}
      aria-posinset={ariaPosition ?? selectedPosition}
      aria-setsize={ariaTotal ?? total}
      data-work-type={item.reference.workType}
    >
      <div className="stack-row-summary">
        <span className="stack-work-type">
          {item.reference.workType === 'task' ? 'To-do' : 'List'}
        </span>
        <h2>{item.label}</h2>
        <UrgencyBadge urgency={item.urgency} />
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
