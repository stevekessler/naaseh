import { useMemo } from 'react';
import { effectiveDirectoryFields, type GlobalDirectoryItem, type ListItem } from '@naaseh/domain';
export function useEffectiveListItems(items: ListItem[], directory: GlobalDirectoryItem[]) {
  return useMemo(() => {
    const current = new Map(directory.map((item) => [item.id, item]));
    return items.map((item) => ({
      ...item,
      effective: effectiveDirectoryFields(
        {
          directorySnapshot: item.directorySnapshot,
          ...(item.nameOverride ? { nameOverride: item.nameOverride } : {}),
          ...(item.valueOverride ? { valueOverride: item.valueOverride } : {}),
        },
        item.directoryItemId ? current.get(item.directoryItemId) : undefined,
      ),
    }));
  }, [items, directory]);
}
