interface ClearableFinanceIndex {
  clear(): void;
}
const activeIndexes = new Set<ClearableFinanceIndex>();

export function registerFinanceSearchIndex(index: ClearableFinanceIndex) {
  activeIndexes.add(index);
  return () => {
    activeIndexes.delete(index);
  };
}

export function clearFinanceSearchIndexes() {
  for (const index of activeIndexes) index.clear();
}
