import { z } from 'zod';
import {
  syncCursorSchema,
  tombstoneSchema,
  workspaceGenerationHeader,
  workspaceRecordSchema,
  type FeatureHost,
  type SyncCursor,
} from '@naaseh/contacts-inventory-contracts';
import { type Draft, type OfflineWorkspace, type Projection } from './store.js';

const snapshotSchema = z.object({
  items: z.array(workspaceRecordSchema),
  nextCursor: z.string().nullable(),
});
const changesSchema = z.object({
  changes: z.array(z.object({ record: z.union([tombstoneSchema, workspaceRecordSchema]) })),
  nextCursor: syncCursorSchema,
  highWater: z.int().nonnegative(),
  hasMore: z.boolean(),
});

async function json(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error('The shared workspace is unavailable. Try again.');
  return response.json();
}

function mutationRequest(draft: Draft) {
  const collection = draft.kind === 'contact' ? 'contacts' : 'items';
  const headers = new Headers({
    [workspaceGenerationHeader]: String(draft.generation),
    'idempotency-key': draft.mutationId,
    ...(draft.action === 'create'
      ? { 'if-none-match': '*' }
      : { 'if-match': `"${draft.revision}"` }),
  });
  if (draft.action !== 'delete') headers.set('content-type', 'application/json');
  return {
    path: `/${collection}/${draft.id}`,
    options: {
      method: draft.action === 'delete' ? 'DELETE' : 'PUT',
      headers,
      ...(draft.action !== 'delete' ? { body: JSON.stringify(draft.fields) } : {}),
    },
  };
}

export function connectWorkspace(
  host: FeatureHost,
  local: OfflineWorkspace,
  onFailure: (error: unknown) => void,
) {
  const controller = new AbortController();
  let running: Promise<boolean> | undefined;
  const request = (path: string, options?: RequestInit) =>
    host.request(path, { ...options, signal: controller.signal });

  async function catchUp(initial: SyncCursor) {
    let cursor = initial;
    let through: number | undefined;
    while (true) {
      const query = new URLSearchParams({ after: String(cursor.sequence) });
      if (through !== undefined) query.set('through', String(through));
      const response = await request(`/changes?${query}`, {
        headers: { [workspaceGenerationHeader]: String(cursor.generation) },
      });
      if (response.status === 409 && (await response.clone().json()).code === 'reset_required')
        return false;
      const page = changesSchema.parse(await json(response));
      controller.signal.throwIfAborted();
      if (
        !(await local.apply(
          cursor,
          page.nextCursor,
          page.changes.map(({ record }) => record),
        ))
      )
        return false;
      if (!page.hasMore) return true;
      through = page.highWater;
      cursor = page.nextCursor;
    }
  }

  async function synchronize() {
    const existing = await local.cursor();
    const checkpoint = syncCursorSchema.parse(await json(await request('/sync/checkpoint')));
    if (existing?.generation !== checkpoint.generation || existing.sequence > checkpoint.sequence) {
      const projections: Projection[] = [];
      for (const collection of ['contacts', 'items']) {
        let next: string | null = null;
        do {
          const path = next
            ? `/${collection}?cursor=${encodeURIComponent(next)}`
            : `/${collection}`;
          const response = await request(path, {
            headers: { [workspaceGenerationHeader]: String(checkpoint.generation) },
          });
          const page = snapshotSchema.parse(await json(response));
          projections.push(...page.items);
          next = page.nextCursor;
        } while (next !== null);
      }
      controller.signal.throwIfAborted();
      if (!(await local.apply(existing, checkpoint, projections, true))) return false;
    }
    const cursor = await local.cursor();
    if (!cursor || !(await catchUp(cursor))) return false;

    // Sequential replay keeps later writes behind their earlier record dependencies.
    for (const row of await local.pending()) {
      controller.signal.throwIfAborted();
      const draft = await local.decode(row);
      const { path, options } = mutationRequest(draft);
      const response = await request(path, options);
      controller.signal.throwIfAborted();
      if (response.ok) {
        const result = await response.json();
        if (result.deleted && draft.action !== 'delete') await local.fail(row, 'deleted');
        else await local.acknowledge(row);
      } else if (response.status === 409) {
        const error = await response.json();
        const status = error.code === 'reset_required' ? 'reset_required' : 'conflict';
        await local.fail(row, status);
        break;
      } else {
        await json(response);
      }
    }
    const latest = await local.cursor();
    return latest ? catchUp(latest) : false;
  }

  function refresh() {
    if (!running && !controller.signal.aborted)
      running = synchronize()
        .catch((error: unknown) => {
          if (!controller.signal.aborted) onFailure(error);
          return false;
        })
        .finally(() => {
          running = undefined;
        });
    return running;
  }
  const unsubscribe = host.subscribe((event) => {
    if (event === 'lock' || event === 'sign-out' || event === 'revoked') controller.abort();
    else if (event === 'reconnect' || event === 'foreground' || event === 'unlock') void refresh();
  });
  return {
    refresh,
    close() {
      controller.abort();
      unsubscribe();
      local.close();
    },
  };
}
