import { urgencyLabels, type Urgency } from '@naaseh/domain';

const compactGlyphs: Record<Urgency, string> = {
  low: '○',
  medium: '◆',
  high: '▲',
  critical: '!',
};

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
      aria-label={`Priority: ${label}`}
      title={`Priority: ${label}`}
    >
      {mode === 'responsive' ? (
        <>
          <span className="priority-icon" aria-hidden="true">
            {compactGlyphs[urgency]}
          </span>
          <span className="priority-text">Priority: {label}</span>
        </>
      ) : mode === 'compact' ? (
        <span aria-hidden="true">{compactGlyphs[urgency]}</span>
      ) : (
        `Priority: ${label}`
      )}
    </span>
  );
}
