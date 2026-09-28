import type { JournalDocument, Task } from '@naaseh/domain';
import { ReferenceCombobox } from '../../components/ReferenceCombobox.js';
import { JournalRichTextEditor } from './JournalRichTextEditor.js';

export function JournalTaskReflection({
  tasks,
  taskId,
  notes,
  onChange,
}: {
  tasks: Task[];
  taskId: string | null;
  notes: JournalDocument | null;
  onChange: (value: { taskId: string | null; notes: JournalDocument | null }) => void;
}) {
  const clear = () => {
    if (notes && !window.confirm('Clear the task reference and its reflection?')) return;
    onChange({ taskId: null, notes: null });
  };
  return (
    <section className="journal-task-reflection">
      <h3>Task Reflection</h3>
      <ReferenceCombobox
        label="Related task"
        name="relatedTask"
        options={tasks.map((task) => ({
          id: task.id,
          label: task.label,
          context: `${task.percentComplete ?? 0}% complete`,
        }))}
        value={taskId ?? ''}
        clearLabel="No related task"
        placeholder="Search tasks"
        onChange={(nextTaskId) => onChange({ taskId: nextTaskId || null, notes })}
      />
      {taskId && (
        <>
          <JournalRichTextEditor
            label="Task Reflection notes"
            value={notes}
            onChange={(next) => onChange({ taskId, notes: next })}
          />
          <button type="button" onClick={clear}>
            Clear task reference
          </button>
        </>
      )}
    </section>
  );
}
