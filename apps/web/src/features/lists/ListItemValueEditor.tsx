import { useEffect, useState } from 'react';
import { parseSignedMinor } from '@naaseh/domain';

export function ListItemValueEditor({
  value,
  save,
  reset,
}: {
  value?: number | null;
  save: (value: number | null) => void;
  reset?: () => void;
}) {
  const [text, setText] = useState(value == null ? '' : String(Math.abs(value) / 100));
  const [positive, setPositive] = useState((value ?? -1) > 0);
  useEffect(() => {
    setText(value == null ? '' : String(Math.abs(value) / 100));
    setPositive((value ?? -1) > 0);
  }, [value]);
  return (
    <div className="value-editor">
      <label>
        Amount
        <input
          inputMode="decimal"
          value={text}
          placeholder="No value"
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <label className="value-editor-credit">
        <input
          type="checkbox"
          checked={positive}
          onChange={(event) => setPositive(event.target.checked)}
        />
        Positive credit
      </label>
      <button
        type="button"
        onClick={() => save(text ? parseSignedMinor(text, positive ? 'credit' : 'cost') : null)}
      >
        Save amount
      </button>
      {reset && (
        <button
          type="button"
          className="quiet"
          aria-label="Reset name and amount to global values"
          title="Reset to global"
          onClick={reset}
        >
          ↻ Reset to global
        </button>
      )}
    </div>
  );
}
