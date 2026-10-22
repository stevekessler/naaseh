import { urgencyValues, type List, type ListItem } from '@naaseh/domain';

export type SortDirection = 'ascending' | 'descending';
export type ListIndexSortKey = 'name' | 'category' | 'project' | 'items' | 'priority';
export type ListItemSortKey = 'status' | 'name' | 'due' | 'memo' | 'fileLinks';
export type TableSort<Key extends string> = { key: Key; direction: SortDirection };

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function compareOptional(
  left: string | number | undefined,
  right: string | number | undefined,
  direction: SortDirection,
) {
  if (left === undefined && right === undefined) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  const comparison =
    typeof left === 'number' && typeof right === 'number'
      ? left - right
      : collator.compare(String(left), String(right));
  return direction === 'ascending' ? comparison : -comparison;
}

export function sortListsForTable(
  lists: readonly List[],
  sort: TableSort<ListIndexSortKey> | undefined,
  itemCounts: ReadonlyMap<string, number>,
  categoryNamesByList: ReadonlyMap<string, string>,
  projectNames: ReadonlyMap<string, string>,
) {
  if (!sort) return [...lists];
  const value = (list: List): string | number | undefined => {
    if (sort.key === 'name') return list.name;
    if (sort.key === 'category') return categoryNamesByList.get(list.id);
    if (sort.key === 'project')
      return list.projectId ? projectNames.get(list.projectId) : undefined;
    if (sort.key === 'items') return itemCounts.get(list.id) ?? 0;
    return urgencyValues.indexOf(list.urgency);
  };
  return lists
    .map((list, index) => ({ list, index }))
    .sort(
      (left, right) =>
        compareOptional(value(left.list), value(right.list), sort.direction) ||
        left.index - right.index,
    )
    .map(({ list }) => list);
}

export type EffectiveListItem = { item: ListItem; name: string };

export function sortListItemsForTable(
  items: readonly EffectiveListItem[],
  sort?: TableSort<ListItemSortKey>,
) {
  const value = ({ item, name }: EffectiveListItem): string | undefined => {
    if (!sort || sort.key === 'status') return item.completedAt;
    if (sort.key === 'name') return name;
    if (sort.key === 'due') return item.dueDate;
    if (sort.key === 'memo') return item.memo || undefined;
    return item.fileLinks?.[0];
  };
  return items
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => {
      const leftCompleted = left.entry.item.status === 'completed';
      const rightCompleted = right.entry.item.status === 'completed';
      if (leftCompleted !== rightCompleted) return leftCompleted ? 1 : -1;
      if (!sort) return left.index - right.index;
      return (
        compareOptional(value(left.entry), value(right.entry), sort.direction) ||
        left.index - right.index
      );
    })
    .map(({ entry }) => entry);
}
