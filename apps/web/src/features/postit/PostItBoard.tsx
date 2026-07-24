import type { CategoryRecord, Task } from '@naaseh/domain';
import { PostItNote } from './PostItNote.js';
import { usePostItCompletion } from './usePostItCompletion.js';

export function PostItBoard({
  tasks,
  categories = [],
  onToggle,
}: {
  tasks: Task[];
  categories?: CategoryRecord[];
  onToggle: (task: Task) => Promise<void>;
}) {
  const { completing, announcement, complete } = usePostItCompletion(onToggle);
  const colors = new Map(categories.map((category) => [category.id, category.color]));
  return (
    <>
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
      <div className="postit-board">
        {tasks.map((task) => (
          <PostItNote
            key={task.id}
            task={task}
            {...(task.categoryId && colors.get(task.categoryId)
              ? { color: colors.get(task.categoryId)! }
              : {})}
            animating={completing === task.id}
            complete={() => void complete(task)}
          />
        ))}
      </div>
    </>
  );
}
