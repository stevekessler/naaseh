import { ItemImage } from './ItemImage.js';
import { useEffect, useState, type FormEvent } from 'react';
import {
  itemFieldsSchema,
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
  save,
  remove,
}: {
  item?: InventoryItem;
  locations: InventoryLocation[];
  save(fields: ItemFields): Promise<void>;
  remove(): Promise<void>;
}) {
  const [name, setName] = useState(item?.fields.name ?? '');
  const [locationId, setLocation] = useState(item?.fields.locationId ?? '');
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = itemFieldsSchema.safeParse({ name, locationId, type: 'base' });
    if (!parsed.success) {
      setIssue('Enter an item name and choose a location.');
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

export function InventoryPage({ host, recordId }: { host: FeatureHost; recordId?: string }) {
  const [items, setItems] = useState<InventoryItem[]>([]);
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
      const [records, cursor, catalogs, { drafts, conflicts }] = await Promise.all([
        local.read(),
        local.cursor(),
        local.locations(),
        local.draftStatus(),
      ]);
      if (controller.signal.aborted) return;
      const displayed = new Map<string, InventoryItem>();
      for (const record of records) {
        const parsed = itemFieldsSchema.safeParse(record.fields);
        if (record.kind === 'item' && parsed.success)
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
        if (response.ok)
          await local.cacheLocations(
            locationSchema.array().parse((await response.json()).locations),
          );
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
      ...(fields ? { fields } : {}),
    });
    if (action === 'delete')
      setItems((current) => current.filter((entry) => entry.id !== item?.id));
    setCreating(false);
    void workspace.refresh();
  }
  const filtered = visibleItems(items, name, location);

  return (
    <section aria-label="Inventory">
      <h1>Inventory</h1>
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
      {!recordId && (
        <button
          type="button"
          disabled={!generation || locations.length === 0}
          onClick={() => setCreating(true)}
        >
          New item
        </button>
      )}
      {!locations.length && generation && <p>Add an inventory location before creating an item.</p>}
      {(creating || item) && (
        <ItemForm
          key={item?.id ?? 'new'}
          locations={locations}
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
            <button
              type="button"
              onClick={() => {
                setName('');
                setLocation('');
              }}
            >
              Clear filters
            </button>
          </div>
          {filtered.length === 0 ? (
            <p>{name || location ? 'No matching items.' : 'No inventory items yet.'}</p>
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
