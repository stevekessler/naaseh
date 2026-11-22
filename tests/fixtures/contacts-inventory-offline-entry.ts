import { OfflineWorkspace } from '../../apps/contacts-inventory/src/offline/store.js';
import {
  hostProtocol,
  type FeatureModule,
  type WorkspaceRecord,
} from '../../packages/contacts-inventory-contracts/src/index.js';

export const protocol = hostProtocol;

export const mount: FeatureModule['mount'] = (container, _location, host) => {
  const local = new OfflineWorkspace(host);
  const id = 'b4d02419-80af-4a8f-b710-1a49e7ca3000';
  const record: WorkspaceRecord = {
    kind: 'contact',
    id,
    revision: 1,
    lastChangeSequence: 1,
    createdAt: '2026-11-17T20:00:00.000Z',
    updatedAt: '2026-11-17T20:00:00.000Z',
    fields: { firstName: 'Synthetic offline contact' },
  };
  const initial = { generation: 1, sequence: 1 };
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const refresh = async () => {
    const [records, pending] = await Promise.all([local.read(), local.pending()]);
    status.textContent = `${records.length} local records, ${pending.length} queued changes`;
  };
  const button = (label: string, action: () => Promise<unknown>) => {
    const element = document.createElement('button');
    element.textContent = label;
    element.onclick = () =>
      void action()
        .then(refresh)
        .catch(() => {
          status.textContent = 'Fixture action failed.';
        });
    return element;
  };
  container.append(
    status,
    button('Cache synthetic contact', () => local.apply(undefined, initial, [record], true)),
    button('Queue synthetic edit', () =>
      local.queue({
        kind: record.kind,
        id,
        generation: 1,
        mutationId: 'b4d02419-80af-4a8f-b710-1a49e7ca3001',
        action: 'update',
        revision: 1,
        fields: { firstName: 'Synthetic queued edit' },
      }),
    ),
    button('Restore workspace', () =>
      local.apply(initial, { generation: 2, sequence: 1 }, [record], true),
    ),
    button('Review and apply draft', async () => {
      const [review] = await local.reviews();
      if (
        review?.draft?.fields?.firstName !== 'Synthetic queued edit' ||
        review.current?.fields.firstName !== 'Synthetic offline contact'
      )
        throw new Error('Expected the offline edit and the restored record');
      await local.resolve(review, true);
      const [pending] = await local.pending();
      if (!pending) throw new Error('Expected an explicitly reconciled draft');
      const draft = await local.decode(pending);
      if (
        draft.generation !== 2 ||
        draft.revision !== record.revision ||
        draft.mutationId === review.draft.mutationId
      )
        throw new Error('The reconciled draft was not rebased onto the restored workspace');
    }),
    button('Apply tombstone', () =>
      local.apply(initial, { generation: 1, sequence: 2 }, [
        {
          kind: record.kind,
          id,
          revision: 2,
          lastChangeSequence: 2,
          deleted: true,
        },
      ]),
    ),
  );
  void refresh();
  return () => {
    local.close();
    container.replaceChildren();
  };
};
