import { formatMinor, totalMinor } from '@naaseh/domain';
export function ListTotal({
  values,
  currency = 'USD',
}: {
  values: (number | null | undefined)[];
  currency?: string;
}) {
  return (
    <output className="list-total" aria-label="List total">
      Total: {formatMinor(totalMinor(values), currency)}
    </output>
  );
}
