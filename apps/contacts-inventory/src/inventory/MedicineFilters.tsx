import type { ContactType } from '@naaseh/contacts-inventory-contracts';
import {
  SelectOptions,
  statusOptions,
  timeOptions,
  whoOptions,
  type PrescriberOption,
} from './MedicineFields.js';

export const emptyMedicineFilters = {
  whoMed: '',
  status: '',
  includeOnMedList: '',
  strengthUnitId: '',
  timeTaken: '',
  expirationFrom: '',
  expirationTo: '',
  prescriberId: '',
};
export type MedicineFilterValues = typeof emptyMedicineFilters;

export function MedicineFilters({
  filters,
  change,
  units,
  prescribers,
}: {
  filters: MedicineFilterValues;
  change(next: MedicineFilterValues): void;
  units: ContactType[];
  prescribers: PrescriberOption[];
}) {
  const selects = [
    ['whoMed', 'Filter by Who’s Med', whoOptions],
    ['status', 'Filter by status', statusOptions],
    ['includeOnMedList', 'Filter by list inclusion', { yes: 'Included', no: 'Excluded' }],
    [
      'strengthUnitId',
      'Filter by strength unit',
      Object.fromEntries(units.map(({ id, name }) => [id, name])),
    ],
    ['timeTaken', 'Filter by time taken', timeOptions],
    [
      'prescriberId',
      'Filter by prescriber',
      Object.fromEntries(prescribers.map(({ id, name }) => [id, name])),
    ],
  ] as const;
  return (
    <fieldset>
      <legend>Medicine filters</legend>
      {selects.map(([key, label, options]) => (
        <label key={key}>
          {label}
          <select
            value={filters[key]}
            onChange={(event) => change({ ...filters, [key]: event.currentTarget.value })}
          >
            <option value="">Any</option>
            <SelectOptions choices={options} />
          </select>
        </label>
      ))}
      {(
        [
          ['expirationFrom', 'Expiration from'],
          ['expirationTo', 'Expiration through'],
        ] as const
      ).map(([key, label]) => (
        <label key={key}>
          {label}
          <input
            type="date"
            value={filters[key]}
            onChange={(event) => change({ ...filters, [key]: event.currentTarget.value })}
          />
        </label>
      ))}
    </fieldset>
  );
}
