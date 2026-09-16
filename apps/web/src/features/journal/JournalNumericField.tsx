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
    <fieldset className="journal-field journal-numeric-field">
      <legend>{label}</legend>
      <div className="journal-rating">
        <output aria-live="polite" aria-label={`${label} selected value`}>
          {value ?? '—'}
        </output>
        <input
          aria-label={`${label} slider`}
          aria-valuetext={value === null ? 'No value selected' : String(value)}
          type="range"
          min={minimum}
          max={maximum}
          step={step}
          value={value ?? minimum}
          onChange={(event) => update(event.target.value)}
          onPointerUp={(event) => update(event.currentTarget.value)}
        />
        <div className="journal-rating-endpoints" aria-hidden="true">
          <span>{minimum}</span>
          <span>{maximum}</span>
        </div>
      </div>
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
