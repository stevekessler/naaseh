export function JournalNumericField({
  id,
  label,
  value,
  minimum,
  maximum,
  step,
  onChange,
}: {
  id: string;
  label: string;
  value: number | null;
  minimum: number;
  maximum: number;
  step: number;
  onChange: (value: number | null) => void;
}) {
  const update = (raw: string) => onChange(raw === '' ? null : Number(raw));
  return (
    <fieldset className="journal-field">
      <legend>
        {label} <span>(optional)</span>
      </legend>
      <input
        aria-label={`${label} slider`}
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={value ?? minimum}
        onChange={(event) => update(event.target.value)}
      />
      <input
        id={id}
        aria-label={label}
        type="number"
        min={minimum}
        max={maximum}
        step={step}
        value={value ?? ''}
        onChange={(event) => update(event.target.value)}
      />
      <button type="button" onClick={() => onChange(null)}>
        Clear
      </button>
    </fieldset>
  );
}
