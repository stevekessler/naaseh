import {
  contactFieldsSchema,
  contactMatches,
  itemFieldsSchema,
  type FeatureHost,
  type FeatureSearch,
  type FeatureSearchHit,
  type WorkspaceRecord,
} from '@naaseh/contacts-inventory-contracts';
import { contactName } from './contacts/contact-filters.js';
import { connectWorkspace } from './offline/replay.js';
import { OfflineWorkspace } from './offline/store.js';

export function searchProjection(records: WorkspaceRecord[]): FeatureSearch {
  const contacts = records.flatMap((record) => {
    if (record.kind !== 'contact') return [];
    const parsed = contactFieldsSchema.safeParse(record.fields);
    return parsed.success
      ? [{ id: record.id, fields: parsed.data, title: contactName(parsed.data) }]
      : [];
  });
  const items = records.flatMap((record): FeatureSearchHit[] => {
    if (record.kind !== 'item') return [];
    const parsed = itemFieldsSchema.safeParse(record.fields);
    return parsed.success
      ? [
          {
            id: record.id,
            type: parsed.data.type === 'medicine' ? 'medicine' : 'inventory',
            title: parsed.data.name,
          },
        ]
      : [];
  });
  return (query, flags) => {
    const term = query.trim();
    if (!term) return [];
    const matches: FeatureSearchHit[] = items.filter(
      (entry) => flags[entry.type] && entry.title.toLowerCase().includes(term.toLowerCase()),
    );
    if (flags.contacts) {
      for (const contact of contacts) {
        if (contactMatches(contact.fields, term))
          matches.push({ type: 'contacts', id: contact.id, title: contact.title });
      }
    }
    return matches.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  };
}

export function watchSearch(host: FeatureHost, publish: (search: FeatureSearch | null) => void) {
  const controller = new AbortController();
  const local = new OfflineWorkspace(host);
  const sync = connectWorkspace(host, local, () => {});
  let running = false;
  async function refresh() {
    if (running || controller.signal.aborted) return;
    running = true;
    try {
      if (navigator.onLine) {
        // A prior encrypted snapshot alone cannot authorize online results.
        const permission = await host.request('/sync/checkpoint', { signal: controller.signal });
        if (!permission.ok) {
          publish(null);
          return;
        }
        await permission.body?.cancel();
        await sync.refresh();
      }
      const records = await local.read();
      if (!controller.signal.aborted) publish(searchProjection(records));
    } catch {
      if (!controller.signal.aborted) publish(null);
    } finally {
      running = false;
    }
  }
  function close() {
    controller.abort();
    window.clearInterval(interval);
    unsubscribe();
    sync.close();
    publish(null);
  }
  const unsubscribe = host.subscribe((event) => {
    if (event === 'lock' || event === 'sign-out' || event === 'revoked') close();
    else if (event === 'foreground' || event === 'reconnect') void refresh();
  });
  const interval = window.setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) void refresh();
  }, 15000);
  void refresh();
  return close;
}
