import { useEffect, useState, type FormEvent } from 'react';
import {
  contactTypeSchema,
  workspaceGenerationHeader,
  type ContactType,
  type FeatureHost,
} from '@naaseh/contacts-inventory-contracts';

export function ContactTypesPage({ host }: { host: FeatureHost }) {
  const [types, setTypes] = useState<ContactType[]>([]);
  const [selected, setSelected] = useState<ContactType>();
  const [name, setName] = useState('');
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
        setTypes(contactTypeSchema.array().parse(body.contactTypes));
        setGeneration(body.generation);
      })
      .catch(() => {
        if (!controller.signal.aborted) setMessage('Contact types could not be loaded.');
      });
    return () => controller.abort();
  }, [host]);

  function choose(type?: ContactType) {
    setSelected(type);
    setName(type?.name ?? '');
    setDraftId(crypto.randomUUID());
    setMutationId(crypto.randomUUID());
    setMessage('');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!generation || busy || !name.trim()) return;
    setBusy(true);
    try {
      const response = await host.request(`/catalogs/contact-types/${selected?.id ?? draftId}`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          [workspaceGenerationHeader]: String(generation),
          'idempotency-key': mutationId,
          ...(selected ? { 'if-match': `"${selected.revision}"` } : { 'if-none-match': '*' }),
        },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!response.ok) {
        setMessage(
          response.status === 409
            ? 'This contact type changed. Reopen Contact Types before retrying.'
            : 'Contact type could not be saved. Try again.',
        );
        return;
      }
      const updated = contactTypeSchema.parse(await response.json());
      setTypes((previous) =>
        [...previous.filter(({ id }) => id !== updated.id), updated].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      choose();
      setMessage('Contact type saved.');
    } catch {
      setMessage('Contact type could not be saved. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Contact Types">
      <h1>Contact Types</h1>
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
        <h2>{selected ? 'Rename contact type' : 'New contact type'}</h2>
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
        <button type="submit" disabled={busy || !generation}>
          Save type
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
