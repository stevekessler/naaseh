import {
  effectiveDirectoryFields,
  formatMinor,
  type GlobalDirectoryItem,
  type ListItem,
} from '@naaseh/domain';
import { ListItemRow } from './ListItemRow.js';
import { AttachmentPanelForParent } from '../attachments/AttachmentPanelForParent.js';
export function ListItems({
  items,
  toggle,
  remove,
  edit,
  reset,
  promote,
  reorder,
  csrfToken,
  directory,
}: {
  items: ListItem[];
  toggle: (item: ListItem) => void;
  remove: (item: ListItem) => void;
  edit: (item: ListItem, name: string, amountMinor: number | null) => void;
  reset: (item: ListItem) => void;
  promote: (item: ListItem, name: string, amountMinor: number | null) => void;
  reorder: (items: ListItem[]) => void;
  csrfToken: string;
  directory: GlobalDirectoryItem[];
}) {
  if (!items.length) return <p>No items yet.</p>;
  return (
    <ul className="list-items">
      {items.map((item, index) => {
        const current = item.directoryItemId
          ? directory.find((entry) => entry.id === item.directoryItemId)
          : undefined;
        const effective = effectiveDirectoryFields(
          {
            directorySnapshot: item.directorySnapshot,
            ...(item.nameOverride ? { nameOverride: item.nameOverride } : {}),
            ...(item.valueOverride ? { valueOverride: item.valueOverride } : {}),
          },
          current,
        );
        const move = (offset: number) => {
          const ordered = [...items];
          const [selected] = ordered.splice(index, 1);
          if (!selected) return;
          ordered.splice(index + offset, 0, selected);
          reorder(ordered);
        };
        return (
          <ListItemRow
            key={item.id}
            item={item}
            name={effective.name}
            {...(effective.amountMinor === null
              ? {}
              : { value: formatMinor(effective.amountMinor, current?.currency ?? 'USD') })}
            onToggle={() => toggle(item)}
            onRemove={() => remove(item)}
            onEdit={(name, amount) => edit(item, name, amount)}
            {...(item.directoryItemId ? { onReset: () => reset(item) } : {})}
            onPromote={() => promote(item, effective.name, effective.amountMinor)}
            {...(index > 0 ? { moveUp: () => move(-1) } : {})}
            {...(index < items.length - 1 ? { moveDown: () => move(1) } : {})}
            attachments={
              <AttachmentPanelForParent
                parentType="listItem"
                parentId={item.id}
                csrfToken={csrfToken}
              />
            }
          />
        );
      })}
    </ul>
  );
}
