const hasExtraLow = (value: unknown): boolean => {
  if (typeof value === 'string') return value.toLocaleLowerCase().includes('extra_low');
  if (Array.isArray(value)) return value.some(hasExtraLow);
  return Boolean(
    value &&
      typeof value === 'object' &&
      Object.entries(value).some(
        ([key, child]) => key.toLocaleLowerCase().includes('extra_low') || hasExtraLow(child),
      ),
  );
};

/** Fail closed without rewriting encrypted records, ranks, outbox entries, keys, or settings. */
export function assertNoExtraLowActiveValues(values: readonly unknown[]) {
  if (values.some(hasExtraLow))
    throw new Error('Local schema upgrade blocked: an unexpected Extra Low value was found.');
}
