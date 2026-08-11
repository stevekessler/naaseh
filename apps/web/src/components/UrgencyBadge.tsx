import { urgencyLabels, type Urgency } from '@naaseh/domain';

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  const label = urgencyLabels[urgency];
  return (
    <span className="urgency-badge" data-urgency={urgency} aria-label={`Priority: ${label}`}>
      Priority: {label}
    </span>
  );
}
