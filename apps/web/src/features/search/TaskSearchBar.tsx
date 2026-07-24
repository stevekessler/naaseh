export function TaskSearchBar({
  value,
  setValue,
  count,
}: {
  value: string;
  setValue: (value: string) => void;
  count: number;
}) {
  return (
    <label className="search">
      <span>Search</span>
      <input
        type="search"
        placeholder="Label or memo"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <span role="status" aria-live="polite">
        {count} {count === 1 ? 'result' : 'results'}
      </span>
    </label>
  );
}
