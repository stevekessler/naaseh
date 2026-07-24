import {
  effectiveDirectoryFields,
  type GlobalDirectoryItem,
  type List,
  type ListItem,
  type Task,
} from '@naaseh/domain';
import { MixedContentIndex, TaskIndex } from './task-index.js';

const yieldFrame = () =>
  new Promise<void>((resolve) =>
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(() => resolve())
      : setTimeout(resolve, 0),
  );

export async function rebuildTaskIndex(tasks: Task[], yieldEvery = 500) {
  const index = new TaskIndex();
  for (let i = 0; i < tasks.length; i += 1) {
    index.upsert(tasks[i]!);
    if (i > 0 && i % yieldEvery === 0) await yieldFrame();
  }
  return index;
}

export async function rebuildMixedIndex(
  input: {
    tasks: Task[];
    lists: List[];
    listItems: ListItem[];
    directory: GlobalDirectoryItem[];
  },
  state: (value: 'rebuilding' | 'ready') => void = () => {},
  yieldEvery = 500,
) {
  state('rebuilding');
  const index = new MixedContentIndex();
  const directory = new Map(input.directory.map((item) => [item.id, item]));
  let processed = 0;
  for (const task of input.tasks) {
    index.upsert({
      id: task.id,
      type: 'todo',
      title: task.label,
      body: task.memoHidden ? '' : task.memo,
    });
    if (++processed % yieldEvery === 0) await yieldFrame();
  }
  for (const list of input.lists) {
    index.upsert({ id: list.id, type: 'list', title: list.name });
    if (++processed % yieldEvery === 0) await yieldFrame();
  }
  for (const item of input.listItems) {
    const current = item.directoryItemId ? directory.get(item.directoryItemId) : undefined;
    const effective = effectiveDirectoryFields(
      {
        directorySnapshot: item.directorySnapshot,
        ...(item.nameOverride ? { nameOverride: item.nameOverride } : {}),
        ...(item.valueOverride ? { valueOverride: item.valueOverride } : {}),
      },
      current,
    );
    index.upsert({ id: item.id, type: 'listItem', parentId: item.listId, title: effective.name });
    if (++processed % yieldEvery === 0) await yieldFrame();
  }
  state('ready');
  return index;
}
