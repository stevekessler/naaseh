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
    <fieldset className="journal-field">
      <legend>
        {label} <span>(optional)</span>
      </legend>
      {(
        [
          ['yes', true],
          ['no', false],
          ['unanswered', null],
        ] as const
      ).map(([name, next]) => (
        <label key={name}>
          <input type="radio" name={id} checked={value === next} onChange={() => onChange(next)} />
          {name === 'unanswered' ? 'Unanswered' : name[0]!.toUpperCase() + name.slice(1)}
        </label>
      ))}
    </fieldset>
  );
}
