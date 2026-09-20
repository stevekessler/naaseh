import { urgencyLabels, type Urgency } from '@naaseh/domain';

/** Priority shapes and colors from the supplied icon reference. */
export function PriorityIcon({ urgency }: { urgency: Urgency }) {
  return (
    <svg
      className="priority-icon"
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      data-priority-icon={urgency}
    >
      {urgency === 'critical' ? (
        <>
          <path
            fill="#d51116"
            d="M14 2a2.8 2.8 0 0 1 4 0l12 12a2.8 2.8 0 0 1 0 4L18 30a2.8 2.8 0 0 1-4 0L2 18a2.8 2.8 0 0 1 0-4Z"
          />
          <path fill="white" d="M14.2 8a1.8 1.8 0 0 1 3.6 0L17 20h-2Z" />
          <circle cx="16" cy="24" r="1.9" fill="white" />
        </>
      ) : urgency === 'medium' ? (
        <circle cx="16" cy="16" r="12" fill="none" stroke="#80ad3c" strokeWidth="5" />
      ) : (
        <path
          d={urgency === 'high' ? 'M16 3 29 28H3Z' : 'M16 29 3 4h26Z'}
          fill="none"
          stroke={urgency === 'high' ? '#ee8d2f' : '#5674b9'}
          strokeWidth="5"
        />
      )}
    </svg>
  );
}
export function UrgencyBadge({
  urgency,
  mode = 'full',
}: {
  urgency: Urgency;
  mode?: 'full' | 'compact' | 'responsive';
}) {
  const label = urgencyLabels[urgency];
  return (
    <span
      className={`urgency-badge urgency-badge--${mode}`}
      data-urgency={urgency}
      aria-label={label}
      title={label}
    >
      <PriorityIcon urgency={urgency} />
      {mode !== 'compact' && <span className="priority-text">{label}</span>}
    </span>
  );
}
