import {
  urgencyLabels,
  urgencyValues,
  zeroUrgencyCounts,
  type UrgencyCounts,
} from '@naaseh/domain';

export function UrgencyBreakdown({
  counts,
  label,
  heading = label,
  tiles = false,
}: {
  counts?: UrgencyCounts | undefined;
  label: string;
  heading?: string;
  tiles?: boolean;
}) {
  const values = counts ?? zeroUrgencyCounts();
  return (
    <section className="urgency-summary" aria-label={label}>
      <h3>{heading}</h3>
      <ul className="urgency-breakdown">
        {urgencyValues.map((urgency) => (
          <li key={urgency} data-priority={tiles ? urgency : undefined}>
            {tiles ? (
              <>
                <span>{urgencyLabels[urgency]}</span>
                <strong>{values[urgency]}</strong>
              </>
            ) : (
              `${urgencyLabels[urgency]}: ${values[urgency]}`
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
