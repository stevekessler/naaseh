import { createHash } from 'node:crypto';
import { z } from 'zod';
import { syncCursorSchema, workspaceGenerationHeader } from '@naaseh/contacts-inventory-contracts';
import { changes, snapshot } from './sync.js';
import { WorkspaceError, WorkspaceRepository } from './repository.js';

const uuid = z.uuid();
const pageCursor = z.object({ scope: z.string(), generation: z.int().positive(), after: uuid });
const integers = /^[0-9]+$/u;

function integer(value: string | undefined, defaultValue?: number) {
  if (value === undefined && defaultValue !== undefined) return defaultValue;
  if (!value || !integers.test(value) || !Number.isSafeInteger(Number(value)))
    throw new WorkspaceError('invalid_cursor');
  return Number(value);
}

export function isWorkspaceReadPath(path: string) {
  return (
    path === 'sync/checkpoint' || path === 'changes' || /^(contacts|items)(\/[^/]+)?$/u.test(path)
  );
}

export async function readWorkspace(
  repo: WorkspaceRepository,
  actor: string,
  workspace: string,
  path: string,
  query: Record<string, string | undefined>,
  headers: Record<string, string | undefined>,
) {
  if (path === 'sync/checkpoint') return repo.store.checkpoint();

  if (path !== 'changes' && path.includes('/')) {
    const [collection, id] = path.split('/');
    const parsedId = uuid.safeParse(id);
    return parsedId.success
      ? repo.read({
          kind: collection === 'contacts' ? 'contact' : 'item',
          id: parsedId.data.toLowerCase(),
        })
      : null;
  }

  const limit = integer(query.limit, 50);
  if (limit < 1 || limit > 100) throw new WorkspaceError('invalid_cursor');
  const generation = integer(headers[workspaceGenerationHeader]);
  if (path === 'changes') {
    const cursor = syncCursorSchema.safeParse({ generation, sequence: integer(query.after, 0) });
    if (!cursor.success) throw new WorkspaceError('invalid_cursor');
    const through = query.through === undefined ? undefined : integer(query.through);
    return changes(repo.store, cursor.data, limit, through);
  }

  const scope = createHash('sha256')
    .update(JSON.stringify([actor, workspace, path]))
    .digest('base64url');
  let after: string | undefined;
  if (query.cursor !== undefined) {
    if (query.cursor.length > 512) throw new WorkspaceError('invalid_cursor');
    try {
      const parsed = pageCursor.parse(
        JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')),
      );
      if (parsed.scope !== scope || parsed.generation !== generation) throw new Error();
      after = parsed.after;
    } catch {
      throw new WorkspaceError('invalid_cursor');
    }
  }
  const page = await snapshot(
    repo.store,
    path === 'contacts' ? 'contact' : 'item',
    generation,
    after,
    limit,
  );
  return {
    items: page.items,
    nextCursor: page.next
      ? Buffer.from(JSON.stringify({ scope, generation, after: page.next })).toString('base64url')
      : null,
  };
}
