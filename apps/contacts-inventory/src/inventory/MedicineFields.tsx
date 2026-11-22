import type { ContactType, MedicineFields as Values } from '@naaseh/contacts-inventory-contracts';

export const whoOptions = {
  steve: 'Steve',
  heather: 'Heather',
  both: 'Both',
  penny: 'Penny',
  otc: 'OTC',
};
export const statusOptions = { current: 'Current', discontinued: 'Discontinued' };
export const timeOptions = {
  morning: 'Morning',
  night: 'Night',
  'morning-and-night': 'Morning and Night',
  prn: 'PRN',
};
export type PrescriberOption = { id: string; name: string };

export function SelectOptions({ choices }: { choices: Record<string, string> }) {
  return Object.entries(choices).map(([value, label]) => (
    <option key={value} value={value}>
      {label}
    </option>
  ));
}

export function MedicineFields({
  fields,
  units,
  prescribers,
}: {
  fields?: Values;
  units: ContactType[];
  prescribers: PrescriberOption[];
}) {
  return (
    <fieldset>
      <legend>Medicine details</legend>
      <label>
        Who’s Med
        <select name="whoMed" required defaultValue={fields?.whoMed ?? ''}>
          <option value="">Choose who</option>
          <SelectOptions choices={whoOptions} />
        </select>
      </label>
      <label>
        Status
        <select name="status" required defaultValue={fields?.status ?? 'current'}>
          <SelectOptions choices={statusOptions} />
        </select>
      </label>
      <label>
        <input
          name="includeOnMedList"
          type="checkbox"
          defaultChecked={fields?.includeOnMedList ?? false}
        />
        Include on Med List
      </label>
      <label>
        Strength number
        <input
          name="strengthNumber"
          type="number"
          step="any"
          defaultValue={fields?.strengthNumber}
        />
      </label>
      <label>
        Strength unit
        <select name="strengthUnitId" defaultValue={fields?.strengthUnitId ?? ''}>
          <option value="">None</option>
          {units.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Other
        <input name="other" maxLength={500} defaultValue={fields?.other} />
      </label>
      <label>
        Dose
        <input name="dose" maxLength={300} defaultValue={fields?.dose} />
      </label>
      <label>
        Time Taken
        <select name="timeTaken" required defaultValue={fields?.timeTaken ?? ''}>
          <option value="">Choose a time</option>
          <SelectOptions choices={timeOptions} />
        </select>
      </label>
      <label>
        Expiration date
        <input name="expirationDate" type="date" defaultValue={fields?.expirationDate} />
      </label>
      <label>
        Prescriber
        <select name="prescriberId" defaultValue={fields?.prescriberId ?? ''}>
          <option value="">None</option>
          {prescribers.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}

export function medicineFormData(data: FormData) {
  const field = (key: string) => String(data.get(key) ?? '') || undefined;
  const strength = field('strengthNumber');
  return {
    whoMed: field('whoMed'),
    status: field('status'),
    timeTaken: field('timeTaken'),
    includeOnMedList: data.has('includeOnMedList'),
    strengthNumber: strength === undefined ? undefined : Number(strength),
    strengthUnitId: field('strengthUnitId'),
    other: field('other'),
    dose: field('dose'),
    expirationDate: field('expirationDate'),
    prescriberId: field('prescriberId'),
  };
}
