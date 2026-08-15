import { lazy, Suspense, type CSSProperties, type FormEvent, useState } from 'react';
import {
  defaultUrgency,
  instantToLocalDue,
  localDueToInstant,
  memoDocumentText,
  plainMemoDocument,
  type CategoryRecord,
  type MemoDocument,
  type Project,
  type PostItColor,
  type Task,
  type TaskInput,
  type Urgency,
} from '@naaseh/domain';
import { ProjectPicker } from '../projects/ProjectPicker.js';
import { UrgencyField } from '../../components/UrgencyField.js';
import {
  AssigneePicker,
  canonicalAssigneeId,
  type AssigneeOption,
} from '../../components/AssigneePicker.js';
import { CategoryPicker } from '../../components/CategoryPicker.js';
import { ReferenceCombobox } from '../../components/ReferenceCombobox.js';
import { timeOptionsForTask } from './due-value.js';
import { postItPalette } from '../../styles/category-color.js';

const MemoEditor = lazy(() =>
  import('../memos/MemoEditor.js').then(({ MemoEditor }) => ({ default: MemoEditor })),
);

export function categoryDefaultAssignee(
  categoryId: string,
  categories: readonly CategoryRecord[],
  creatorId?: string,
) {
  return (
    categories.find((category) => category.id === categoryId)?.defaultAssigneeId ?? creatorId ?? ''
  );
}

export function eligibleParentTasks(task: Task | undefined, parentTasks: readonly Task[]) {
  const descendantIds = new Set<string>();
  if (task) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const candidate of parentTasks)
        if (
          candidate.parentId &&
          (candidate.parentId === task.id || descendantIds.has(candidate.parentId)) &&
          !descendantIds.has(candidate.id)
        ) {
          descendantIds.add(candidate.id);
          changed = true;
        }
    }
  }
  return parentTasks
    .filter(
      (candidate) =>
        candidate.id !== task?.id &&
        !descendantIds.has(candidate.id) &&
        candidate.status === 'open' &&
        (candidate.lifecycle ?? 'active') === 'active' &&
        candidate.completionState !== 'completed',
    )
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function TaskForm({
  save,
  task,
  categories = [],
  projects = [],
  assignees = [],
  parentTasks = [],
  groupOptions = [],
  offline = false,
  defaultAssigneeId,
  submitLabel = task ? 'Save changes' : 'Add task',
}: {
  save: (task: TaskInput) => Promise<void>;
  task?: Task;
  categories?: readonly CategoryRecord[];
  projects?: readonly Project[];
  assignees?: readonly AssigneeOption[];
  parentTasks?: readonly Task[];
  groupOptions?: readonly { id: string; label: string; context?: string }[];
  offline?: boolean;
  defaultAssigneeId?: string;
  submitLabel?: string;
}) {
  const [urgency, setUrgency] = useState<Urgency>(task?.urgency ?? defaultUrgency);
  const initialCategoryId =
    task?.categoryId ??
    projects.find((project) => project.id === task?.projectId)?.categoryId ??
    '';
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [projectId, setProjectId] = useState(task?.projectId ?? '');
  const initialCategory = categories.find((category) => category.id === initialCategoryId);
  const [assigneeId, setAssigneeId] = useState(
    task
      ? (task.assigneeId ?? '')
      : (initialCategory?.defaultAssigneeId ?? defaultAssigneeId ?? ''),
  );
  const [assigneeTouched, setAssigneeTouched] = useState(false);
  const [memoDocument, setMemoDocument] = useState<MemoDocument>(
    task?.memoDocument ?? plainMemoDocument(task?.memo ?? ''),
  );
  const initialTimed = task?.dueAt ? instantToLocalDue(task.dueAt) : undefined;
  const [dueKind, setDueKind] = useState<'none' | 'date' | 'timed'>(
    task?.dueKind ?? (task?.dueDate ? 'date' : task?.dueAt ? 'timed' : 'none'),
  );
  const [dueDate, setDueDate] = useState(task?.dueDate ?? initialTimed?.localDate ?? '');
  const [dueTime, setDueTime] = useState(initialTimed?.localTime ?? '10:00');
  const [parentId, setParentId] = useState(task?.parentId ?? '');
  const [groupId, setGroupId] = useState(task?.groupId ?? '');
  const [postItColor, setPostItColor] = useState<PostItColor | ''>(task?.postItColor ?? '');
  const openParentTasks = eligibleParentTasks(task, parentTasks);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (name: string) => String(data.get(name) ?? '').trim();
    const submittedProjectId = value('projectId');
    const submittedCategoryId =
      projects.find((item) => item.id === submittedProjectId)?.categoryId || value('categoryId');
    await save({
      label: value('label'),
      memo: memoDocumentText(memoDocument),
      memoDocument,
      link: value('link'),
      ...(dueKind === 'date' && dueDate ? { dueKind, dueDate } : {}),
      ...(dueKind === 'timed' && dueDate && dueTime
        ? { dueKind, dueAt: localDueToInstant(dueDate, dueTime).dueAt }
        : {}),
      assigneeId: canonicalAssigneeId(assignees, assigneeId) || undefined,
      ...(submittedCategoryId ? { categoryId: submittedCategoryId } : {}),
      ...(submittedProjectId ? { projectId: submittedProjectId } : {}),
      ...(groupId ? { groupId } : {}),
      ...(parentId ? { parentId } : {}),
      visibility: data.get('private') ? 'private' : 'public',
      urgency,
      ...(postItColor ? { postItColor } : {}),
    });
    if (!task) {
      form.reset();
      setUrgency(defaultUrgency);
      setCategoryId('');
      setProjectId('');
      setAssigneeId(defaultAssigneeId ?? '');
      setAssigneeTouched(false);
      setMemoDocument(plainMemoDocument(''));
      setDueKind('none');
      setDueDate('');
      setDueTime('10:00');
      setParentId('');
      setGroupId('');
      setPostItColor('');
      form.querySelector<HTMLDetailsElement>('.task-form-details')?.removeAttribute('open');
    }
  }
  return (
    <form className="task-form" onSubmit={submit}>
      <label>
        Task label
        <input name="label" required maxLength={300} defaultValue={task?.label} />
      </label>
      <details className="task-form-details" {...(task ? { open: true } : {})}>
        <summary>Task details</summary>
        <label>Memo</label>
        {typeof document === 'undefined' ? (
          <div className="memo-editor" aria-label="Memo">
            {memoDocumentText(memoDocument)}
          </div>
        ) : (
          <Suspense fallback={<p role="status">Loading memo editor…</p>}>
            <MemoEditor value={memoDocument} onChange={setMemoDocument} />
          </Suspense>
        )}
        <label>
          Link
          <input name="link" type="url" pattern="https://.*" defaultValue={task?.link} />
        </label>
        <div className="form-grid">
          <label>
            Priority
            <UrgencyField value={urgency} onChange={setUrgency} label="Priority" />
          </label>
          <label>
            Due
            <select
              value={dueKind}
              onChange={(event) => setDueKind(event.target.value as typeof dueKind)}
            >
              <option value="none">No due date</option>
              <option value="date">Date only</option>
              <option value="timed">Date and time</option>
            </select>
          </label>
          {dueKind !== 'none' && (
            <label>
              Due date
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                required
              />
            </label>
          )}
          {dueKind === 'timed' && (
            <label>
              Due time
              <select value={dueTime} onChange={(event) => setDueTime(event.target.value)}>
                {timeOptionsForTask(task?.dueAt).map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Task assignee
            <AssigneePicker
              assignees={assignees}
              value={assigneeId}
              ariaLabel="Assignee"
              onChange={(nextAssigneeId) => {
                setAssigneeId(nextAssigneeId);
                setAssigneeTouched(true);
              }}
            />
          </label>
          <label>
            Category
            <CategoryPicker
              categories={categories}
              value={categoryId}
              onChange={(nextCategoryId) => {
                setCategoryId(nextCategoryId);
                if (!task && !assigneeTouched)
                  setAssigneeId(
                    categoryDefaultAssignee(nextCategoryId, categories, defaultAssigneeId),
                  );
                if (
                  projectId &&
                  projects.find((project) => project.id === projectId)?.categoryId !==
                    nextCategoryId
                )
                  setProjectId('');
              }}
            />
          </label>
          <ProjectPicker
            categories={categories}
            projects={projects}
            categoryId={categoryId}
            value={projectId}
            onChange={(nextProjectId) => {
              setProjectId(nextProjectId);
              const nextCategoryId = projects.find(
                (project) => project.id === nextProjectId,
              )?.categoryId;
              if (nextCategoryId) {
                setCategoryId(nextCategoryId);
                if (!task && !assigneeTouched)
                  setAssigneeId(
                    categoryDefaultAssignee(nextCategoryId, categories, defaultAssigneeId),
                  );
              }
            }}
          />
          <ReferenceCombobox
            label="Group"
            name="group"
            options={groupOptions}
            value={groupId}
            onChange={setGroupId}
            offline={offline}
            clearLabel="No group"
          />
          <ReferenceCombobox
            label="Parent task"
            name="parent"
            options={openParentTasks.map((candidate) => ({
              id: candidate.id,
              label: candidate.label,
              ...(candidate.projectId
                ? { context: `Project ${candidate.projectId.slice(-6)}` }
                : candidate.categoryId
                  ? { context: `Category ${candidate.categoryId}` }
                  : {}),
            }))}
            value={parentId}
            onChange={setParentId}
            offline={offline}
            clearLabel="No parent task"
          />
        </div>
        <label className="checkbox">
          <input name="private" type="checkbox" defaultChecked={task?.visibility === 'private'} />{' '}
          Private task
        </label>
        {task && (
          <fieldset className="post-it-color-picker">
            <legend>Post-it color</legend>
            <label>
              <input
                type="radio"
                name="postItColor"
                checked={!postItColor}
                onChange={() => setPostItColor('')}
              />
              Use category color
            </label>
            {(Object.keys(postItPalette) as PostItColor[]).map((color) => (
              <label
                key={color}
                style={{ '--swatch-color': postItPalette[color].background } as CSSProperties}
              >
                <input
                  type="radio"
                  name="postItColor"
                  value={color}
                  checked={postItColor === color}
                  onChange={() => setPostItColor(color)}
                />
                <span className="post-it-color-swatch" aria-hidden="true" />
                {color[0]!.toUpperCase() + color.slice(1)}
              </label>
            ))}
          </fieldset>
        )}
      </details>
      <button>{submitLabel}</button>
    </form>
  );
}
