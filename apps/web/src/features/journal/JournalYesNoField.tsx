export function JournalYesNoField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
}) {
  return (
    <fieldset className="journal-field journal-choice-field">
      <legend>{label}</legend>
      {(
        [
          ['yes', true],
          ['no', false],
        ] as const
      ).map(([name, next]) => (
        <label key={name}>
          <input type="radio" name={id} checked={value === next} onChange={() => onChange(next)} />
          {name[0]!.toUpperCase() + name.slice(1)}
        </label>
      ))}
    </fieldset>
  );
}
