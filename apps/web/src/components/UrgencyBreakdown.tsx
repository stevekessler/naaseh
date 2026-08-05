import {
  urgencyLabels,
  urgencyValues,
  zeroUrgencyCounts,
  type UrgencyCounts,
} from '@naaseh/domain';

export function UrgencyBreakdown({
  counts,
  label,
}: {
  counts?: UrgencyCounts | undefined;
  label: string;
}) {
  const values = counts ?? zeroUrgencyCounts();
  return (
    <section aria-label={label}>
      <h3>{label}</h3>
      <ul className="urgency-breakdown">
        {urgencyValues.map((urgency) => (
          <li key={urgency}>
            {urgencyLabels[urgency]}: {values[urgency]}
          </li>
        ))}
      </ul>
    </section>
  );
}
