export const encodeFinanceValue = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    item instanceof Set
      ? { $financeSet: [...item] }
      : item instanceof Map
        ? { $financeMap: [...item] }
        : item,
  );
export const decodeFinanceValue = (value: string): unknown =>
  JSON.parse(value, (_key, item: unknown) => {
    if (item && typeof item === 'object') {
      if ('$financeSet' in item) return new Set((item as { $financeSet: unknown[] }).$financeSet);
      if ('$financeMap' in item)
        return new Map((item as { $financeMap: [string, unknown][] }).$financeMap);
    }
    return item;
  });
