import { z } from 'zod';

export const syncCursorSchema = z.object({
  generation: z.int().positive(),
  sequence: z.int().nonnegative(),
});
export type SyncCursor = z.infer<typeof syncCursorSchema>;

export const recordKindSchema = z.enum(['contact', 'item']);
export const recordIdentitySchema = z.object({
  kind: recordKindSchema,
  id: z.uuid(),
  revision: z.int().positive(),
  lastChangeSequence: z.int().positive(),
});
export const tombstoneSchema = recordIdentitySchema.extend({
  deleted: z.literal(true),
});
export type Tombstone = z.infer<typeof tombstoneSchema>;

export const mutationPreconditionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('create'), generation: z.int().positive(), mutationId: z.uuid() }),
  z.object({
    mode: z.literal('update'),
    generation: z.int().positive(),
    mutationId: z.uuid(),
    revision: z.int().positive(),
  }),
]);

export function featureApiPrefix(releaseId: string) {
  return `/api/v1/contacts-inventory/releases/${releaseId}/`;
}

export const workspaceRecordSchema = recordIdentitySchema.extend({
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  fields: z.record(z.string(), z.json()),
});
export type WorkspaceRecord = z.infer<typeof workspaceRecordSchema>;
export type MutationPrecondition = z.infer<typeof mutationPreconditionSchema>;
export const workspaceGenerationHeader = 'x-workspace-generation';

export function parseMutationHeaders(headers: Record<string, string | undefined>) {
  const generation = headers[workspaceGenerationHeader];
  const mutationId = headers['idempotency-key'];
  const creates = headers['if-none-match'];
  const matches = headers['if-match'];
  if (!generation || !/^[1-9]\d*$/u.test(generation)) return null;
  const shared = { generation: Number(generation), mutationId };
  const revision = matches?.match(/^"([1-9]\d*)"$/u)?.[1];
  const parsed = mutationPreconditionSchema.safeParse(
    creates === '*' && matches === undefined
      ? { ...shared, mode: 'create' }
      : creates === undefined && revision
        ? { ...shared, mode: 'update', revision: Number(revision) }
        : null,
  );
  return parsed.success ? parsed.data : null;
}
