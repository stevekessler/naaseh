import type { JournalDocument, Task } from '@naaseh/domain';
import { useCombobox } from 'downshift';
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
  const selected = tasks.find((task) => task.id === taskId) ?? null;
  const combo = useCombobox({
    items: tasks,
    itemToString: (item) => item?.label ?? '',
    selectedItem: selected,
    onSelectedItemChange: ({ selectedItem }) =>
      onChange({ taskId: selectedItem?.id ?? null, notes }),
  });
  const clear = () => {
    if (notes && !window.confirm('Clear the task reference and its reflection?')) return;
    onChange({ taskId: null, notes: null });
  };
  return (
    <section>
      <h3>Task reflection</h3>
      <div>
        <label {...combo.getLabelProps()}>Related task (optional)</label>
        <input {...combo.getInputProps()} />
        <button type="button" {...combo.getToggleButtonProps()}>
          Choose task
        </button>
        <ul {...combo.getMenuProps()}>
          {combo.isOpen &&
            tasks.map((task, index) => (
              <li key={task.id} {...combo.getItemProps({ item: task, index })}>
                {task.label}
              </li>
            ))}
        </ul>
      </div>
      {taskId && (
        <>
          <JournalRichTextEditor
            label="Task reflection notes"
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
