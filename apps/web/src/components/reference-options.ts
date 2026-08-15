export interface ReferenceOption {
  id: string;
  label: string;
  context?: string;
}
export function filterReferenceOptions(
  options: readonly ReferenceOption[],
  query: string,
  limit = 50,
) {
  const normalized = query.normalize('NFKC').trim().toLocaleLowerCase();
  return options
    .filter((option) =>
      `${option.label} ${option.context ?? ''}`
        .normalize('NFKC')
        .toLocaleLowerCase()
        .includes(normalized),
    )
    .slice(0, limit);
}
