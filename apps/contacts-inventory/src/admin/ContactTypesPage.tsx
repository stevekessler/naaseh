import { useEffect, useState, type FormEvent } from 'react';
import {
  contactTypeSchema,
  locationSchema,
  workspaceGenerationHeader,
  type InventoryLocation,
  type FeatureHost,
} from '@naaseh/contacts-inventory-contracts';

export function CatalogPage({
  host,
  kind,
}: {
  host: FeatureHost;
  kind: 'contact-types' | 'locations';
}) {
  const isLocation = kind === 'locations';
  const schema = isLocation ? locationSchema : contactTypeSchema;
  const title = isLocation ? 'Locations' : 'Contact Types';
  const singular = isLocation ? 'location' : 'contact type';
  const [types, setTypes] = useState<InventoryLocation[]>([]);
  const [selected, setSelected] = useState<InventoryLocation>();
  const [name, setName] = useState('');
  const [details, setDetails] = useState('');
  const [generation, setGeneration] = useState<number>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [mutationId, setMutationId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    const controller = new AbortController();
    void host
      .request('/catalogs', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const body = await response.json();
        if (controller.signal.aborted) return;
        setTypes(schema.array().parse(isLocation ? body.locations : body.contactTypes));
        setGeneration(body.generation);
      })
      .catch(() => {
        if (!controller.signal.aborted) setMessage(`${title} could not be loaded.`);
      });
    return () => controller.abort();
  }, [host, isLocation, schema, title]);

  function choose(type?: InventoryLocation) {
    setSelected(type);
    setName(type?.name ?? '');
    setDetails(type?.details ?? '');
    setDraftId(crypto.randomUUID());
    setMutationId(crypto.randomUUID());
    setMessage('');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!generation || busy || !name.trim()) return;
    setBusy(true);
    try {
      const response = await host.request(`/catalogs/${kind}/${selected?.id ?? draftId}`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          [workspaceGenerationHeader]: String(generation),
          'idempotency-key': mutationId,
          ...(selected ? { 'if-match': `"${selected.revision}"` } : { 'if-none-match': '*' }),
        },
        body: JSON.stringify({ name: name.trim(), ...(isLocation ? { details } : {}) }),
      });
      if (!response.ok) {
        setMessage(
          response.status === 409
            ? `This ${singular} changed. Reopen ${title} before retrying.`
            : `The ${singular} could not be saved. Try again.`,
        );
        return;
      }
      const updated = schema.parse(await response.json());
      setTypes((previous) =>
        [...previous.filter(({ id }) => id !== updated.id), updated].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      choose();
      setMessage(isLocation ? 'Location saved.' : 'Contact type saved.');
    } catch {
      setMessage(`The ${singular} could not be saved. Try again.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={title}>
      <h1>{title}</h1>
      <ul>
        {types.map((type) => (
          <li key={type.id}>
            <button type="button" className="quiet" onClick={() => choose(type)} disabled={busy}>
              {type.name}
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={(event) => void save(event)}>
        <h2>{`${selected ? (isLocation ? 'Edit' : 'Rename') : 'New'} ${singular}`}</h2>
        <label>
          Name
          <input
            required
            maxLength={80}
            value={name}
            onChange={(event) => {
              setName(event.currentTarget.value);
              setMutationId(crypto.randomUUID());
            }}
          />
        </label>
        {isLocation && (
          <label>
            Location details
            <textarea
              value={details}
              maxLength={12000}
              onChange={(event) => {
                setDetails(event.currentTarget.value);
                setMutationId(crypto.randomUUID());
              }}
            />
          </label>
        )}
        <button type="submit" disabled={busy || !generation}>
          {isLocation ? 'Save location' : 'Save type'}
        </button>
        {selected && (
          <button type="button" disabled={busy} onClick={() => choose()}>
            Cancel
          </button>
        )}
      </form>
      {message && <p role="status">{message}</p>}
    </section>
  );
}

export function ContactTypesPage({ host }: { host: FeatureHost }) {
  return <CatalogPage host={host} kind="contact-types" />;
}
