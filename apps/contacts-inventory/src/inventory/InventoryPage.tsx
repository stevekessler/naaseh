import { MedicineFields, medicineFormData, type PrescriberOption } from './MedicineFields.js';
import { emptyMedicineFilters, MedicineFilters } from './MedicineFilters.js';
import { contactName } from '../contacts/contact-filters.js';
import { ItemImage } from './ItemImage.js';
import { useEffect, useState, type FormEvent } from 'react';
import {
  contactFieldsSchema,
  prescriberContactTypeId,
  strengthUnitSchema,
  type ContactType,
  itemFieldsSchema,
  itemPayload,
  locationSchema,
  type FeatureHost,
  type InventoryLocation,
  type ItemFields,
} from '@naaseh/contacts-inventory-contracts';
import { connectWorkspace } from '../offline/replay.js';
import { OfflineWorkspace, type Draft } from '../offline/store.js';
import { visibleItems, type InventoryItem } from './item-filters.js';

function ItemForm({
  item,
  locations,
  units,
  prescribers,
  save,
  remove,
}: {
  item?: InventoryItem;
  locations: InventoryLocation[];
  units: ContactType[];
  prescribers: PrescriberOption[];
  save(fields: ItemFields): Promise<void>;
  remove(): Promise<void>;
}) {
  const [name, setName] = useState(item?.fields.name ?? '');
  const [type, setType] = useState<ItemFields['type']>(item?.fields.type ?? 'base');
  const [locationId, setLocation] = useState(item?.fields.locationId ?? '');
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = itemFieldsSchema.safeParse({
      name,
      locationId,
      type,
      ...(type === 'medicine' ? medicineFormData(new FormData(event.currentTarget)) : {}),
    });
    if (!parsed.success) {
      setIssue('Check the item details and required selections.');
      return;
    }
    await act(() => save(parsed.data));
  }
  async function act(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setIssue('');
    try {
      await action();
    } catch {
      setIssue('The item change could not be saved. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      aria-label={item ? 'Edit inventory item' : 'New inventory item'}
      onSubmit={(event) => void submit(event)}
    >
      <label>
        Item name
        <input
          value={name}
          maxLength={200}
          required
          onChange={(event) => setName(event.currentTarget.value)}
        />
      </label>
      <label>
        Location
        <select
          value={locationId}
          required
          onChange={(event) => setLocation(event.currentTarget.value)}
        >
          <option value="">Choose a location</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Item type
        <select
          value={type}
          disabled={Boolean(item)}
          onChange={(event) =>
            setType(event.currentTarget.value === 'medicine' ? 'medicine' : 'base')
          }
        >
          <option value="base">Base</option>
          <option value="medicine">Medicine</option>
        </select>
      </label>
      {type === 'medicine' && (
        <MedicineFields
          units={units}
          prescribers={prescribers}
          {...(item?.fields.type === 'medicine' ? { fields: item.fields } : {})}
        />
      )}
      <button type="submit" disabled={busy}>
        Save item
      </button>
      {item && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Delete ${item.fields.name} for both workspace members?`))
              void act(remove);
          }}
        >
          Delete item
        </button>
      )}
      {issue && <p role="alert">{issue}</p>}
    </form>
  );
}

export function InventoryPage({
  host,
  recordId,
  medicationList = false,
}: {
  host: FeatureHost;
  recordId?: string;
  medicationList?: boolean;
}) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [type, setType] = useState('');
  const [medicineFilters, setMedicineFilters] = useState(emptyMedicineFilters);
  const [units, setUnits] = useState<ContactType[]>([]);
  const [prescribers, setPrescribers] = useState<PrescriberOption[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [generation, setGeneration] = useState<number>();
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState(0);
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [creating, setCreating] = useState(false);
  const [workspace, setWorkspace] = useState<{
    local: OfflineWorkspace;
    refresh(): Promise<void>;
  }>();

  useEffect(() => {
    const local = new OfflineWorkspace(host);
    const controller = new AbortController();
    const sync = connectWorkspace(host, local, () => {
      if (!controller.signal.aborted)
        setMessage('Unable to sync. Your changes are saved on this device.');
    });

    async function readLocal() {
      const [records, cursor, catalogs, cachedUnits, { drafts, conflicts }] = await Promise.all([
        local.read(),
        local.cursor(),
        local.locations(),
        local.strengthUnits(),
        local.draftStatus(),
      ]);
      if (controller.signal.aborted) return;
      const displayed = new Map<string, InventoryItem>();
      const clinicians = new Map<string, PrescriberOption>();
      function setPrescriber(id: string, fields: unknown) {
        const contact = contactFieldsSchema.safeParse(fields);
        if (contact.success && contact.data.contactTypeId === prescriberContactTypeId)
          clinicians.set(id, { id, name: contactName(contact.data) });
        else clinicians.delete(id);
      }
      for (const record of records) {
        if (record.kind === 'contact') {
          setPrescriber(record.id, record.fields);
          continue;
        }
        const parsed = itemFieldsSchema.safeParse(record.fields);
        if (parsed.success)
          displayed.set(record.id, {
            id: record.id,
            revision: record.revision,
            fields: parsed.data,
            ...(record.image ? { image: record.image } : {}),
            ...(record.imageGeneration === undefined
              ? {}
              : { imageGeneration: record.imageGeneration }),
          });
      }
      for (const draft of drafts.filter((entry) => entry.kind === 'item')) {
        if (draft.action === 'delete') displayed.delete(draft.id);
        const parsed = itemFieldsSchema.safeParse(draft.fields);
        if (parsed.success)
          displayed.set(draft.id, {
            ...displayed.get(draft.id),
            id: draft.id,
            revision: (draft.revision ?? 0) + 1,
            fields: parsed.data,
          });
      }
      for (const draft of drafts.filter((entry) => entry.kind === 'contact'))
        setPrescriber(draft.id, draft.action === 'delete' ? undefined : draft.fields);
      setPrescribers([...clinicians.values()].sort((a, b) => a.name.localeCompare(b.name)));
      setUnits(cachedUnits);
      setItems([...displayed.values()]);
      setGeneration(cursor?.generation);
      setLocations(catalogs);
      setPending(drafts.filter((entry) => entry.kind === 'item').length);
      setConflicts(conflicts);
    }

    async function refresh() {
      try {
        await readLocal();
        if (!navigator.onLine) {
          setMessage('Working offline. Your changes will sync when you reconnect.');
          return;
        }
        setMessage('');
        await sync.refresh();
        const response = await host.request('/catalogs', { signal: controller.signal });
        if (response.ok) {
          const data = await response.json();
          await Promise.all([
            local.cacheLocations(locationSchema.array().parse(data.locations)),
            local.cacheStrengthUnits(strengthUnitSchema.array().parse(data.strengthUnits ?? [])),
          ]);
        }
        await readLocal();
      } catch {
        if (!controller.signal.aborted) setMessage('Inventory could not be refreshed. Try again.');
      }
    }

    setWorkspace({ local, refresh });
    const unsubscribe = host.subscribe((event) => {
      if (event === 'foreground' || event === 'reconnect') void refresh();
    });
    void refresh();
    return () => {
      controller.abort();
      unsubscribe();
      sync.close();
    };
  }, [host]);

  const item = items.find((entry) => entry.id === recordId);
  async function change(action: Draft['action'], fields?: ItemFields) {
    if (!workspace || !generation) throw new Error('Inventory is not ready.');
    await workspace.local.queue({
      kind: 'item',
      id: item?.id ?? crypto.randomUUID(),
      generation,
      mutationId: crypto.randomUUID(),
      action,
      ...(item ? { revision: item.revision } : {}),
      ...(fields ? { fields: itemPayload(fields) } : {}),
    });
    if (action === 'delete')
      setItems((current) => current.filter((entry) => entry.id !== item?.id));
    setCreating(false);
    void workspace.refresh();
  }
  const filtered = visibleItems(items, name, location, type, medicineFilters, medicationList);
  const title = medicationList ? 'Medication List' : 'Inventory';

  return (
    <section aria-label={title}>
      <h1>{title}</h1>
      {!recordId &&
        (medicationList ? (
          <button type="button" onClick={() => host.navigate({ page: 'inventory' })}>
            Back to inventory
          </button>
        ) : (
          <button type="button" onClick={() => host.navigate({ page: 'medication-list' })}>
            Medication List
          </button>
        ))}
      {message && <p role="status">{message}</p>}
      {pending > 0 && (
        <p>
          {pending} {pending === 1 ? 'change' : 'changes'} waiting to sync.
        </p>
      )}
      {conflicts > 0 && <p role="alert">{conflicts} workspace changes need review.</p>}
      {recordId && (
        <button type="button" onClick={() => host.navigate({ page: 'inventory' })}>
          Back to inventory
        </button>
      )}
      {!recordId && !medicationList && (
        <button
          type="button"
          disabled={!generation || locations.length === 0}
          onClick={() => setCreating(true)}
        >
          New item
        </button>
      )}
      {!locations.length && generation && !medicationList && (
        <p>Add an inventory location before creating an item.</p>
      )}
      {(creating || item) && (
        <ItemForm
          key={item?.id ?? 'new'}
          locations={locations}
          units={units}
          prescribers={prescribers}
          {...(item ? { item } : {})}
          save={(fields) => change(item ? 'update' : 'create', fields)}
          remove={() => change('delete')}
        />
      )}
      {item && generation && workspace && (
        <ItemImage
          host={host}
          id={item.id}
          generation={generation}
          imageGeneration={item.imageGeneration ?? 0}
          {...(item.image ? { image: item.image } : {})}
          refresh={workspace.refresh}
        />
      )}
      {recordId && !item && generation && <p>This item is unavailable.</p>}
      {!recordId && (
        <>
          <div role="group" aria-label="Filter inventory">
            <label>
              Search inventory
              <input
                type="search"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
              />
            </label>
            <label>
              Filter by location
              <select value={location} onChange={(event) => setLocation(event.currentTarget.value)}>
                <option value="">All locations</option>
                {locations.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            {!medicationList && (
              <label>
                Filter by item type
                <select
                  value={type}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setType(value);
                    if (value !== 'medicine') setMedicineFilters(emptyMedicineFilters);
                  }}
                >
                  <option value="">All item types</option>
                  <option value="base">Base</option>
                  <option value="medicine">Medicine</option>
                </select>
              </label>
            )}
            {!medicationList && type === 'medicine' && (
              <MedicineFilters
                filters={medicineFilters}
                change={setMedicineFilters}
                units={units}
                prescribers={prescribers}
              />
            )}
            <button
              type="button"
              onClick={() => {
                setType('');
                setMedicineFilters(emptyMedicineFilters);
                setName('');
                setLocation('');
              }}
            >
              Clear filters
            </button>
          </div>
          {filtered.length === 0 ? (
            <p>
              {name || location || type
                ? 'No matching items.'
                : medicationList
                  ? 'No medications on the list.'
                  : 'No inventory items yet.'}
            </p>
          ) : (
            <ul>
              {filtered.map(({ id, fields }) => (
                <li key={id}>
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => host.navigate({ page: 'inventory', recordId: id })}
                  >
                    {fields.name}
                  </button>{' '}
                  ·{' '}
                  {locations.find((entry) => entry.id === fields.locationId)?.name ??
                    'Unavailable location'}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
