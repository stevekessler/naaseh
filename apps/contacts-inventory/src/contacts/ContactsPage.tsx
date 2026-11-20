import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  contactFieldsSchema,
  contactPayload,
  contactTypeSchema,
  type ContactFields,
  type ContactType,
  type FeatureHost,
} from '@naaseh/contacts-inventory-contracts';
import { connectWorkspace } from '../offline/replay.js';
import { OfflineWorkspace } from '../offline/store.js';
import { contactName, visibleContacts, type DirectoryContact } from './contact-filters.js';

const fields = [
  ['prefix', 'Prefix'],
  ['firstName', 'First Name'],
  ['lastName', 'Last Name'],
  ['phone', 'Phone'],
  ['fax', 'Fax'],
  ['cell', 'Cell'],
  ['emergencyNumber', 'Emergency Number'],
  ['addressLine1', 'Address Line 1'],
  ['addressLine2', 'Address Line 2'],
  ['city', 'City'],
  ['state', 'State'],
  ['zip', 'Zip'],
] as const;
const numberFields = [
  ['phone', 'Phone'],
  ['cell', 'Cell'],
  ['emergencyNumber', 'Emergency Number'],
] as const;

function ContactForm({
  current,
  types,
  save,
  remove,
  close,
}: {
  current?: DirectoryContact;
  types: ContactType[];
  save: (value: ContactFields) => Promise<void>;
  remove: () => Promise<void>;
  close: () => void;
}) {
  const [values, setValues] = useState<ContactFields>(current?.fields ?? { state: 'CO' });
  const [issue, setIssue] = useState('');
  const [busy, setBusy] = useState(false);

  async function finish(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setIssue('');
    try {
      await action();
      close();
    } catch {
      setIssue('The change could not be saved on this device. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = contactFieldsSchema.safeParse(values);
    if (!parsed.success) {
      setIssue(parsed.error.issues[0]?.message ?? 'Check the contact details and try again.');
      return;
    }
    void finish(() => save(parsed.data));
  }

  return (
    <form onSubmit={submit} aria-label={current ? 'Edit contact' : 'New contact'}>
      <h2>{current ? 'Edit contact' : 'New contact'}</h2>
      {fields.map(([field, label]) => (
        <label key={field}>
          {label}
          <input
            name={field}
            type={['phone', 'fax', 'cell', 'emergencyNumber'].includes(field) ? 'tel' : 'text'}
            value={values[field] ?? ''}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setValues((previous) => ({
                ...previous,
                [field]: value,
                ...(!value.trim() && previous.defaultNumber === field
                  ? { defaultNumber: undefined }
                  : {}),
              }));
            }}
          />
        </label>
      ))}
      <label>
        Default Number
        <select
          value={values.defaultNumber ?? ''}
          onChange={(event) => {
            const value = numberFields.find(([field]) => field === event.currentTarget.value)?.[0];
            setValues((previous) => ({ ...previous, defaultNumber: value }));
          }}
        >
          <option value="">None</option>
          {numberFields
            .filter(([field]) => values[field]?.trim())
            .map(([field, label]) => (
              <option key={field} value={field}>
                {label}
              </option>
            ))}
        </select>
      </label>
      <label>
        Contact Type
        <select
          value={values.contactTypeId ?? ''}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setValues((previous) => ({ ...previous, contactTypeId: value || undefined }));
          }}
        >
          <option value="">None</option>
          {types.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {issue && <p role="alert">{issue}</p>}
      <div role="group" aria-label="Contact actions">
        <button disabled={busy} type="submit">
          Save contact
        </button>
        <button type="button" onClick={close}>
          Cancel
        </button>
        {current && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(`Delete ${contactName(current.fields)} for both workspace members?`)
              )
                void finish(remove);
            }}
          >
            Delete contact
          </button>
        )}
      </div>
    </form>
  );
}

export function ContactsPage({ host, recordId }: { host: FeatureHost; recordId?: string }) {
  const [contacts, setContacts] = useState<DirectoryContact[]>([]);
  const [types, setTypes] = useState<ContactType[]>([]);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [editing, setEditing] = useState<string | 'new' | null>(recordId ?? null);
  const [generation, setGeneration] = useState<number>();
  const [pendingCount, setPendingCount] = useState(0);
  const [conflicts, setConflicts] = useState(0);
  const [issue, setIssue] = useState('');
  const client = useRef<{ local: OfflineWorkspace; refresh: () => Promise<void> } | null>(null);
  const loaded = useCallback(async (local: OfflineWorkspace) => {
    const [records, info, draftStatus, catalog] = await Promise.all([
      local.read(),
      local.cursor(),
      local.draftStatus(),
      local.contactTypes(),
    ]);
    if (client.current?.local !== local) return;
    const entries = new Map<string, DirectoryContact>();
    for (const record of records) {
      const parsed = contactFieldsSchema.safeParse(record.fields);
      if (record.kind === 'contact' && parsed.success)
        entries.set(record.id, { id: record.id, revision: record.revision, fields: parsed.data });
    }
    for (const draft of draftStatus.drafts.filter((next) => next.kind === 'contact')) {
      if (draft.action === 'delete') {
        entries.delete(draft.id);
        continue;
      }
      const parsed = contactFieldsSchema.safeParse(draft.fields);
      if (parsed.success)
        entries.set(draft.id, {
          id: draft.id,
          revision: (draft.revision ?? 0) + 1,
          fields: parsed.data,
        });
    }
    setContacts([...entries.values()]);
    setTypes(catalog);
    setGeneration(info?.generation);
    setPendingCount(draftStatus.drafts.length);
    setConflicts(draftStatus.conflicts);
  }, []);

  useEffect(() => {
    const local = new OfflineWorkspace(host);
    const controller = new AbortController();
    const synchronizer = connectWorkspace(host, local, () => {
      if (!controller.signal.aborted)
        setIssue('Working offline or unable to sync. Your queued edits are saved locally.');
    });
    const refresh = async () => {
      try {
        await loaded(local);
        if (!navigator.onLine) {
          setIssue('Working offline. Your changes will sync when you reconnect.');
          return;
        }
        setIssue('');
        await synchronizer.refresh();
        const response = await host.request('/catalogs', { signal: controller.signal });
        if (response.ok) {
          const body = await response.json();
          await local.cacheContactTypes(contactTypeSchema.array().parse(body.contactTypes));
        }
        await loaded(local);
      } catch {
        if (!controller.signal.aborted) setIssue('Contacts could not be refreshed. Try again.');
      }
    };
    client.current = { local, refresh };
    const unsubscribe = host.subscribe((event) => {
      if (event === 'foreground' || event === 'reconnect') void refresh();
    });
    void refresh();
    return () => {
      controller.abort();
      client.current = null;
      unsubscribe();
      synchronizer.close();
    };
  }, [host, loaded]);

  const selected =
    editing && editing !== 'new' ? contacts.find(({ id }) => id === editing) : undefined;
  const close = () => {
    setEditing(null);
    if (recordId) host.navigate({ page: 'contacts' });
  };
  const queue = async (action: 'create' | 'update' | 'delete', changed?: ContactFields) => {
    if (!client.current || !generation) throw new Error('The workspace has not synchronized yet.');
    const { local, refresh } = client.current;
    await local.queue({
      id: selected?.id ?? crypto.randomUUID(),
      kind: 'contact',
      generation,
      mutationId: crypto.randomUUID(),
      action,
      ...(selected ? { revision: selected.revision } : {}),
      ...(changed ? { fields: contactPayload(changed) } : {}),
    });
    await loaded(local);
    void refresh();
  };
  const results = visibleContacts(contacts, query, type);

  return (
    <section aria-label="Contacts">
      <h1>Contacts</h1>
      {issue && <p role="status">{issue}</p>}
      {pendingCount > 0 && <p>{pendingCount} changes waiting to sync.</p>}
      {conflicts > 0 && <p role="alert">{conflicts} contact or inventory changes need review.</p>}
      <button type="button" disabled={!generation} onClick={() => setEditing('new')}>
        New contact
      </button>
      {editing === 'new' || selected ? (
        <ContactForm
          key={selected?.id ?? 'new'}
          {...(selected ? { current: selected } : {})}
          types={types}
          save={(value) => queue(selected ? 'update' : 'create', value)}
          remove={() => queue('delete')}
          close={close}
        />
      ) : editing && generation ? (
        <p>This contact is unavailable.</p>
      ) : null}
      <div role="group" aria-label="Filter contacts">
        <label>
          Search contacts
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <label>
          Filter by contact type
          <select value={type} onChange={(event) => setType(event.currentTarget.value)}>
            <option value="">All contact types</option>
            {types.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            setQuery('');
            setType('');
          }}
        >
          Clear filters
        </button>
      </div>
      {results.length ? (
        <ul>
          {results.map(({ id, fields: contact }) => (
            <li key={id}>
              <button
                type="button"
                className="quiet"
                onClick={() => host.navigate({ page: 'contacts', recordId: id })}
              >
                {contactName(contact)}
              </button>
              {contact.defaultNumber && contact[contact.defaultNumber] ? (
                <> · {contact[contact.defaultNumber]}</>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>{query || type ? 'No contacts match these filters.' : 'No contacts yet.'}</p>
      )}
    </section>
  );
}
