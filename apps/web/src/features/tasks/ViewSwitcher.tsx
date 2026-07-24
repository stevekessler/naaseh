import type { TaskView } from '../../db/preferences-repository.js';

export function ViewSwitcher({
  view,
  change,
}: {
  view: TaskView;
  change: (view: TaskView) => void;
}) {
  return (
    <div className="view-toggle" role="group" aria-label="Task view">
      <button aria-pressed={view === 'list'} onClick={() => change('list')}>
        List
      </button>
      <button aria-pressed={view === 'postit'} onClick={() => change('postit')}>
        Post-its
      </button>
    </div>
  );
}
