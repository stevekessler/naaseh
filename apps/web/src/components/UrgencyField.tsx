import { urgencyLabels, urgencySchema, urgencyValues, type Urgency } from '@naaseh/domain';

export function UrgencyField({
  value,
  onChange,
  label = 'Priority',
  name = 'urgency',
  disabled = false,
}: {
  value: Urgency;
  onChange: (value: Urgency) => void;
  label?: string;
  name?: string;
  disabled?: boolean;
}) {
  return (
    <select
      name={name}
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(event) => onChange(urgencySchema.parse(event.target.value))}
    >
      {urgencyValues.map((urgency) => (
        <option key={urgency} value={urgency}>
          {urgencyLabels[urgency]}
        </option>
      ))}
    </select>
  );
}
