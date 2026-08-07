import { z } from 'zod';
import { ulidSchema } from './primitives.js';
import { urgencySchema, urgencyValues } from './urgency.js';

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/i, 'Expected a SHA-256 digest.');
const nonEmptyIdSchema = z.string().min(1);

export const membershipEpochSchema = z.string().min(1).max(64);

export const workReferenceSchema = z
  .object({
    workType: z.enum(['task', 'list']),
    workId: ulidSchema,
    membershipEpoch: membershipEpochSchema,
  })
  .strict();

export type WorkReference = z.infer<typeof workReferenceSchema>;

export const personalStackScopeSchema = z.discriminatedUnion('scopeType', [
  z.object({ userId: nonEmptyIdSchema, scopeType: z.literal('overall') }).strict(),
  z
    .object({
      userId: nonEmptyIdSchema,
      scopeType: z.literal('project'),
      scopeId: ulidSchema,
    })
    .strict(),
]);

export type PersonalStackScope = z.infer<typeof personalStackScopeSchema>;

export function workReferenceIdentity(reference: WorkReference): string {
  return `${reference.workType}:${reference.workId}:${reference.membershipEpoch}`;
}

export function stackScopeIdentity(scope: PersonalStackScope): string {
  return scope.scopeType === 'overall'
    ? `${scope.userId}:overall`
    : `${scope.userId}:project:${scope.scopeId}`;
}

/** Personal stacks are private preferences; elevated roles do not confer access. */
export function assertPersonalStackOwner(scope: PersonalStackScope, actorUserId: string): void {
  if (scope.userId !== actorUserId) {
    throw new Error('Personal stack is private and may only be accessed by its owner.');
  }
}

const filterDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a calendar date.');

export const personalStackFilterBasisSchema = z
  .object({
    urgencies: z.array(urgencySchema).max(urgencyValues.length).optional(),
    from: filterDateSchema.optional(),
    to: filterDateSchema.optional(),
    assigneeId: nonEmptyIdSchema.optional(),
    categoryId: ulidSchema.optional(),
    projectId: z.union([ulidSchema, z.literal('unassigned')]).optional(),
    lifecycle: z.literal('active').default('active'),
    contentType: z.enum(['all', 'todos', 'lists']).default('all'),
    searchBasisHash: sha256Schema.optional(),
  })
  .strict()
  .superRefine((basis, context) => {
    if (basis.from !== undefined && basis.to !== undefined && basis.from > basis.to) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'Filter end date must not precede its start date.',
      });
    }

    if (basis.urgencies !== undefined) {
      const indexes = basis.urgencies.map((urgency) => urgencyValues.indexOf(urgency));
      if (new Set(basis.urgencies).size !== basis.urgencies.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['urgencies'],
          message: 'Filter urgency values must be unique.',
        });
      }
      if (indexes.some((index, position) => position > 0 && indexes[position - 1]! >= index)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['urgencies'],
          message: 'Filter urgency values must use canonical urgency order.',
        });
      }
    }
  });

export type PersonalStackFilterBasis = z.infer<typeof personalStackFilterBasisSchema>;

function validateSimpleMove(
  move: {
    movedWork: WorkReference;
    beforeWork?: WorkReference | undefined;
    afterWork?: WorkReference | undefined;
  },
  context: z.RefinementCtx,
): void {
  const movedIdentity = workReferenceIdentity(move.movedWork);
  const beforeIdentity = move.beforeWork && workReferenceIdentity(move.beforeWork);
  const afterIdentity = move.afterWork && workReferenceIdentity(move.afterWork);
  if (beforeIdentity === movedIdentity || afterIdentity === movedIdentity) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A moved work reference cannot also be its own anchor.',
    });
  }
  if (beforeIdentity !== undefined && beforeIdentity === afterIdentity) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Before and after anchors must be distinct.',
    });
  }
}

export const simpleStackMoveSchema = z
  .object({
    kind: z.literal('simple_move'),
    movedWork: workReferenceSchema,
    beforeWork: workReferenceSchema.optional(),
    afterWork: workReferenceSchema.optional(),
  })
  .strict()
  .superRefine(validateSimpleMove);

export type SimpleStackMove = z.infer<typeof simpleStackMoveSchema>;

function validateFilteredPermutation(
  move: {
    movedWork: WorkReference;
    destinationIndex: number;
    affectedWork: WorkReference[];
  },
  context: z.RefinementCtx,
): void {
  const affectedIdentities = move.affectedWork.map(workReferenceIdentity);
  if (new Set(affectedIdentities).size !== affectedIdentities.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['affectedWork'],
      message: 'Affected work references must be unique.',
    });
  }
  if (!affectedIdentities.includes(workReferenceIdentity(move.movedWork))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['movedWork'],
      message: 'Moved work must be included in affected work.',
    });
  }
  if (move.destinationIndex >= move.affectedWork.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['destinationIndex'],
      message: 'Destination index must address an affected slot.',
    });
  }
}

export const filteredStackPermutationSchema = z
  .object({
    kind: z.literal('filtered_permutation'),
    movedWork: workReferenceSchema,
    destinationIndex: z.number().int().nonnegative(),
    affectedWork: z.array(workReferenceSchema).min(1).max(50_000),
    filterBasis: personalStackFilterBasisSchema.optional(),
  })
  .strict()
  .superRefine(validateFilteredPermutation);

export type FilteredStackPermutation = z.infer<typeof filteredStackPermutationSchema>;

export const personalStackMoveSchema = z.union([
  simpleStackMoveSchema,
  filteredStackPermutationSchema,
]);

export type PersonalStackMove = z.infer<typeof personalStackMoveSchema>;

const operationBaseShape = {
  id: ulidSchema,
  mutationId: ulidSchema,
  userId: nonEmptyIdSchema,
  scopeType: z.enum(['overall', 'project']),
  scopeId: ulidSchema.optional(),
  baseVersion: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  sourceClientId: nonEmptyIdSchema,
  acceptedAt: z.string().datetime(),
  affectedHash: sha256Schema,
  outcome: z.enum(['applied', 'pending_compaction', 'conflict', 'rejected']),
} as const;

function validateScopedRecord(
  record: { scopeType: 'overall' | 'project'; scopeId?: string | undefined },
  context: z.RefinementCtx,
): void {
  if (record.scopeType === 'project' && record.scopeId === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['scopeId'],
      message: 'Project stack operations require a project scope ID.',
    });
  }
  if (record.scopeType === 'overall' && record.scopeId !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['scopeId'],
      message: 'Overall stack operations cannot include a project scope ID.',
    });
  }
}

const simpleStackOperationSchema = z
  .object({
    ...operationBaseShape,
    kind: z.literal('simple_move'),
    movedWork: workReferenceSchema,
    beforeWork: workReferenceSchema.optional(),
    afterWork: workReferenceSchema.optional(),
    affectedCount: z.literal(1),
  })
  .strict()
  .superRefine((operation, context) => {
    validateScopedRecord(operation, context);
    validateSimpleMove(operation, context);
  });

const filteredStackOperationSchema = z
  .object({
    ...operationBaseShape,
    kind: z.literal('filtered_permutation'),
    movedWork: workReferenceSchema,
    destinationIndex: z.number().int().nonnegative(),
    affectedWork: z.array(workReferenceSchema).min(1).max(50_000),
    filterBasis: personalStackFilterBasisSchema,
    affectedCount: z.number().int().min(1).max(50_000),
  })
  .strict()
  .superRefine((operation, context) => {
    validateScopedRecord(operation, context);
    validateFilteredPermutation(operation, context);
    if (operation.affectedCount !== operation.affectedWork.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['affectedCount'],
        message: 'Affected count must match the affected work manifest.',
      });
    }
    if (
      operation.scopeType === 'project' &&
      operation.filterBasis.projectId !== undefined &&
      operation.filterBasis.projectId !== operation.scopeId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['filterBasis', 'projectId'],
        message: 'Filter project must agree with the stack project scope.',
      });
    }
  });

export const personalStackOperationSchema = z.union([
  simpleStackOperationSchema,
  filteredStackOperationSchema,
]);

export type PersonalStackOperation = z.infer<typeof personalStackOperationSchema>;

export const personalStackSnapshotChunkSchema = z
  .object({
    userId: nonEmptyIdSchema,
    scopeType: z.enum(['overall', 'project']),
    scopeId: ulidSchema.optional(),
    generation: z.number().int().positive(),
    throughVersion: z.number().int().nonnegative(),
    index: z.number().int().nonnegative(),
    workRefs: z.array(workReferenceSchema),
    membershipEpochs: z.array(membershipEpochSchema),
    checksum: sha256Schema,
  })
  .strict()
  .superRefine((chunk, context) => {
    validateScopedRecord(chunk, context);
    if (chunk.membershipEpochs.length !== chunk.workRefs.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['membershipEpochs'],
        message: 'Membership epochs must match snapshot work reference cardinality.',
      });
    } else if (
      chunk.membershipEpochs.some(
        (epoch, index) => epoch !== chunk.workRefs[index]!.membershipEpoch,
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['membershipEpochs'],
        message: 'Membership epochs must align with snapshot work references.',
      });
    }
    const identities = chunk.workRefs.map(workReferenceIdentity);
    if (new Set(identities).size !== identities.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['workRefs'],
        message: 'Snapshot work references must be unique.',
      });
    }
  });

export type PersonalStackSnapshotChunk = z.infer<typeof personalStackSnapshotChunkSchema>;

export const personalStackSnapshotSchema = z
  .object({
    scope: personalStackScopeSchema,
    generation: z.number().int().positive(),
    throughVersion: z.number().int().nonnegative(),
    workRefs: z.array(workReferenceSchema),
  })
  .strict();

export type PersonalStackSnapshot = z.infer<typeof personalStackSnapshotSchema>;

export const personalStackReplaySchema = z
  .object({
    snapshot: z.array(workReferenceSchema),
    operations: z.array(personalStackMoveSchema),
    implicitTail: z.array(workReferenceSchema),
  })
  .strict();

export type PersonalStackReplayInput = z.infer<typeof personalStackReplaySchema>;

export const personalStackConflictSchema = z
  .object({
    id: ulidSchema,
    userId: nonEmptyIdSchema,
    scope: personalStackScopeSchema,
    operationId: ulidSchema,
    reason: z.enum([
      'version_mismatch',
      'anchor_removed',
      'authorization_changed',
      'lifecycle_changed',
      'project_changed',
      'filter_basis_changed',
      'hard_deleted',
    ]),
    baseVersion: z.number().int().nonnegative(),
    currentVersion: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    resolvedAt: z.string().datetime().optional(),
    resolution: z.enum(['discarded', 'reapplied']).optional(),
  })
  .strict()
  .superRefine((conflict, context) => {
    if (conflict.scope.userId !== conflict.userId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scope', 'userId'],
        message: 'Conflict scope must belong to the conflict owner.',
      });
    }
    if ((conflict.resolvedAt === undefined) !== (conflict.resolution === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Conflict resolution and resolution timestamp must be supplied together.',
      });
    }
  });

export type PersonalStackConflict = z.infer<typeof personalStackConflictSchema>;

function indexByIdentity(order: readonly WorkReference[]): Map<string, number> {
  const indexes = new Map<string, number>();
  order.forEach((reference, index) => {
    const identity = workReferenceIdentity(reference);
    if (indexes.has(identity)) {
      throw new Error(`Stack order contains duplicate work reference ${identity}.`);
    }
    indexes.set(identity, index);
  });
  return indexes;
}

export function orderImplicitTail(references: readonly WorkReference[]): WorkReference[] {
  return [...references].sort(
    (left, right) =>
      left.membershipEpoch.localeCompare(right.membershipEpoch) ||
      left.workType.localeCompare(right.workType) ||
      left.workId.localeCompare(right.workId),
  );
}

export function applySimpleMove(
  order: readonly WorkReference[],
  move: SimpleStackMove,
): WorkReference[] {
  const indexes = indexByIdentity(order);
  const movedIdentity = workReferenceIdentity(move.movedWork);
  const movedIndex = indexes.get(movedIdentity);
  if (movedIndex === undefined) {
    throw new Error('Moved work is not present in the current stack order.');
  }

  const remaining = order.filter((_, index) => index !== movedIndex);
  const remainingIndexes = indexByIdentity(remaining);
  const beforeIndex =
    move.beforeWork === undefined
      ? undefined
      : remainingIndexes.get(workReferenceIdentity(move.beforeWork));
  const afterIndex =
    move.afterWork === undefined
      ? undefined
      : remainingIndexes.get(workReferenceIdentity(move.afterWork));

  if (move.beforeWork !== undefined && beforeIndex === undefined) {
    throw new Error('Before anchor is no longer present in the stack.');
  }
  if (move.afterWork !== undefined && afterIndex === undefined) {
    throw new Error('After anchor is no longer present in the stack.');
  }

  let insertionIndex: number;
  if (beforeIndex !== undefined && afterIndex !== undefined) {
    if (afterIndex !== beforeIndex + 1) {
      throw new Error('Move anchors are not adjacent in the current stack order.');
    }
    insertionIndex = afterIndex;
  } else if (beforeIndex !== undefined) {
    insertionIndex = beforeIndex + 1;
  } else if (afterIndex !== undefined) {
    insertionIndex = afterIndex;
  } else if (remaining.length === 0) {
    insertionIndex = 0;
  } else {
    throw new Error('A simple move requires a valid stack anchor.');
  }

  const result = [...remaining];
  result.splice(insertionIndex, 0, order[movedIndex]!);
  return result;
}

export function applyFilteredPermutation(
  order: readonly WorkReference[],
  move: FilteredStackPermutation,
): WorkReference[] {
  const orderIndexes = indexByIdentity(order);
  const affectedIdentities = move.affectedWork.map(workReferenceIdentity);
  if (new Set(affectedIdentities).size !== affectedIdentities.length) {
    throw new Error('Affected work order contains duplicate references.');
  }

  const movedIdentity = workReferenceIdentity(move.movedWork);
  const movedAffectedIndex = affectedIdentities.indexOf(movedIdentity);
  if (movedAffectedIndex < 0) {
    throw new Error('Moved work must be part of the affected matching work.');
  }
  if (move.destinationIndex < 0 || move.destinationIndex >= move.affectedWork.length) {
    throw new Error('Destination index must address an affected matching slot.');
  }

  const occupiedSlots = affectedIdentities.map((identity) => orderIndexes.get(identity));
  if (occupiedSlots.some((index) => index === undefined)) {
    throw new Error('Affected work is stale or no longer present in the stack order.');
  }
  const slots = occupiedSlots as number[];
  if (slots.some((slot, index) => index > 0 && slots[index - 1]! >= slot)) {
    throw new Error('Affected work order is stale relative to the full stack order.');
  }

  const reordered = [...move.affectedWork];
  const [moved] = reordered.splice(movedAffectedIndex, 1);
  reordered.splice(move.destinationIndex, 0, moved!);

  const result = [...order];
  slots.forEach((slot, index) => {
    result[slot] = reordered[index]!;
  });
  return result;
}

/** Intersect ordering state with current authorization/lifecycle eligibility. */
export function eligiblePersonalStackOrder(
  order: readonly WorkReference[],
  eligibleIdentities: ReadonlySet<string>,
): WorkReference[] {
  const emitted = new Set<string>();
  return order.filter((reference) => {
    const identity = workReferenceIdentity(reference);
    if (!eligibleIdentities.has(identity) || emitted.has(identity)) return false;
    emitted.add(identity);
    return true;
  });
}

export function replayPersonalStack(input: PersonalStackReplayInput): WorkReference[] {
  let order = [...input.snapshot];
  for (const operation of input.operations) {
    order =
      operation.kind === 'simple_move'
        ? applySimpleMove(order, operation)
        : applyFilteredPermutation(order, operation);
  }

  const present = new Set(order.map(workReferenceIdentity));
  for (const reference of orderImplicitTail(input.implicitTail)) {
    const identity = workReferenceIdentity(reference);
    if (!present.has(identity)) {
      order.push(reference);
      present.add(identity);
    }
  }
  return order;
}
