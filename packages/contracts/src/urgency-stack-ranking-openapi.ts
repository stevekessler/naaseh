import { z } from 'zod';

export const urgencyStackRankingContractVersion = 4 as const;
export const urgencyStackRankingContractVersionSchema = z.literal(
  urgencyStackRankingContractVersion,
);

export const urgencyStackRankingOpenApiPath =
  'specs/005-urgency-stack-ranking/contracts/urgency-stack-ranking.openapi.yaml' as const;

export const urgencySchema = z.enum(['low', 'medium', 'high', 'critical']);
export const urgencyValues = urgencySchema.options;

export const urgencyCountsSchema = z
  .object({
    low: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    critical: z.number().int().nonnegative(),
  })
  .strict();

const ulidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const contentTypeSchema = z.enum(['all', 'todos', 'lists']);

export const urgencyQuerySchema = z
  .string()
  .regex(/^(low|medium|high|critical)(,(low|medium|high|critical))*$/)
  .superRefine((value, context) => {
    const values = value.split(',');
    if (new Set(values).size !== values.length)
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Urgencies must be unique.' });
  });

const reportingFilterShape = {
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  timeZone: z.string().min(1).default('UTC'),
  browserTimeZone: z.string().min(1).max(128).optional(),
  weekStartsOn: z.coerce.number().int().min(0).max(6).default(1),
  assignment: z.enum(['all', 'unassigned', 'category', 'project']).default('all'),
  userId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  urgencies: urgencyQuerySchema.optional(),
};

export const completionReportQuerySchema = z
  .object({
    ...reportingFilterShape,
    period: z.enum(['day', 'week', 'month']).default('day'),
  })
  .strict();

export const completionDetailQuerySchema = z
  .object({
    ...reportingFilterShape,
    cursor: z.string().max(4096).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

export const stackPageQuerySchema = z
  .object({
    cursor: z.string().max(4096).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    urgencies: urgencyQuerySchema.optional(),
    contentType: contentTypeSchema.default('all'),
  })
  .strict();

export const workReferenceSchema = z
  .object({
    workType: z.enum(['task', 'list']),
    workId: ulidSchema,
    membershipEpoch: z.string().min(1).max(64),
  })
  .strict();

export const workItemSchema = z
  .object({
    id: ulidSchema,
    workType: z.enum(['task', 'list']),
    urgency: urgencySchema,
    lifecycle: z.enum(['active', 'archived', 'deleting']),
    projectId: ulidSchema.optional(),
    version: z.number().int().positive(),
  })
  .passthrough();

export const rankOverlaySchema = z
  .object({
    overallPosition: z.number().int().positive(),
    projectPosition: z.number().int().positive().optional(),
  })
  .strict();

export const stackItemSchema = z.object({ work: workItemSchema, rank: rankOverlaySchema }).strict();

export const workDetailSchema = z
  .object({ work: workItemSchema, rank: rankOverlaySchema.optional() })
  .strict();

export const stackPageSchema = z
  .object({
    scope: z.enum(['overall', 'project']),
    projectId: ulidSchema.optional(),
    version: z.number().int().nonnegative(),
    snapshotThroughVersion: z.number().int().nonnegative(),
    asOf: z.string().datetime(),
    items: z.array(stackItemSchema),
    nextCursor: z.string().nullable(),
    pendingOperationIds: z.array(ulidSchema).optional(),
  })
  .strict()
  .superRefine((page, context) => {
    if ((page.scope === 'project') !== Boolean(page.projectId))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['projectId'],
        message: 'Project stack pages require projectId; overall pages must omit it.',
      });
  });

export const filterBasisSchema = z
  .object({
    urgencies: z
      .array(urgencySchema)
      .min(1)
      .max(4)
      .refine((items) => new Set(items).size === items.length, {
        message: 'Urgencies must be unique.',
      })
      .optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    assigneeId: z.string().min(1).optional(),
    categoryId: z.string().min(1).optional(),
    projectId: z.string().min(1).optional(),
    contentType: contentTypeSchema.optional(),
    searchBasisHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();

export const simpleMoveSchema = z
  .object({
    kind: z.literal('simple_move'),
    movedWork: workReferenceSchema,
    beforeWork: workReferenceSchema.optional(),
    afterWork: workReferenceSchema.optional(),
  })
  .strict();

export const filteredPermutationSchema = z
  .object({
    kind: z.literal('filtered_permutation'),
    movedWork: workReferenceSchema,
    destinationIndex: z.number().int().nonnegative(),
    affectedWork: z.array(workReferenceSchema).min(2).max(50_000),
    filterBasis: filterBasisSchema,
  })
  .strict()
  .superRefine((move, context) => {
    const identity = (work: z.infer<typeof workReferenceSchema>) =>
      `${work.workType}:${work.workId}:${work.membershipEpoch}`;
    const affected = move.affectedWork.map(identity);
    if (!affected.includes(identity(move.movedWork)))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['movedWork'],
        message: 'Moved work must be present in affectedWork.',
      });
    if (new Set(affected).size !== affected.length)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['affectedWork'],
        message: 'Affected work references must be unique.',
      });
    if (move.destinationIndex >= move.affectedWork.length)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['destinationIndex'],
        message: 'Destination must identify an affected occupied slot.',
      });
  });

export const reorderHeadersSchema = z
  .object({
    'x-csrf-token': z.string().min(16),
    'x-client-id': z.string().min(1).max(200),
    'x-client-mutation-id': ulidSchema,
  })
  .strict();

export const stackMoveSchema = z.union([simpleMoveSchema, filteredPermutationSchema]);

export const reorderRequestSchema = z
  .object({
    scope: z.enum(['overall', 'project']),
    baseVersion: z.number().int().nonnegative(),
    move: stackMoveSchema,
  })
  .strict();

export const reorderResultSchema = z
  .object({
    operationId: ulidSchema,
    mutationId: ulidSchema,
    status: z.enum(['applied', 'pending_compaction', 'conflict', 'rejected']),
    stackVersion: z.number().int().nonnegative(),
    retryAfterSeconds: z.number().int().positive().optional(),
  })
  .strict();

export const completionBucketSchema = z
  .object({
    key: z.string(),
    count: z.number().int().nonnegative(),
    urgencyCounts: urgencyCountsSchema,
  })
  .strict();

export const completionReportSchema = z
  .object({
    period: z.enum(['day', 'week', 'month']),
    timeZone: z.string(),
    from: dateSchema,
    to: dateSchema,
    asOf: z.string().datetime(),
    buckets: z.array(completionBucketSchema),
    total: z.number().int().nonnegative(),
    urgencyCounts: urgencyCountsSchema,
  })
  .strict();

export const completionDetailSchema = z
  .object({
    eventId: ulidSchema,
    workId: ulidSchema,
    workType: z.literal('task'),
    completedAt: z.string().datetime(),
    urgencyAtCompletion: urgencySchema,
    categoryId: z.string().optional(),
    projectId: z.string().optional(),
    reversedAt: z.string().datetime().optional(),
  })
  .strict();

export const completionDetailPageSchema = z
  .object({
    asOf: z.string().datetime(),
    items: z.array(completionDetailSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();

export const workloadCountsSchema = z
  .object({
    tasks: z.number().int().nonnegative(),
    lists: z.number().int().nonnegative(),
    urgencyCounts: urgencyCountsSchema,
  })
  .strict();

export interface OrganizationNodeContract {
  id: string;
  name: string;
  counts: z.infer<typeof workloadCountsSchema>;
  projects?: OrganizationNodeContract[];
  [key: string]: unknown;
}

export const organizationNodeSchema: z.ZodTypeAny = z.lazy(() =>
  z
    .object({
      id: ulidSchema,
      name: z.string(),
      counts: workloadCountsSchema,
      projects: z.array(organizationNodeSchema).optional(),
    })
    .passthrough(),
);

const mutationBaseShape = {
  id: ulidSchema,
  baseVersion: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  attempts: z.number().int().nonnegative(),
};

export const workUrgencyMutationSchema = z
  .object({
    ...mutationBaseShape,
    entityId: ulidSchema,
    entityType: z.enum(['task', 'list']),
    operation: z.literal('update'),
    payload: z.object({ urgency: urgencySchema }).strict(),
  })
  .strict();

export const stackSyncMutationSchema = z
  .object({
    ...mutationBaseShape,
    entityId: z.string().min(1).max(300),
    entityType: z.literal('personalStackOperation'),
    operation: z.literal('reorder'),
    payload: reorderRequestSchema,
  })
  .strict();

export const urgencyStackMutationSchema = z.union([
  workUrgencyMutationSchema,
  stackSyncMutationSchema,
]);

export const mutationResultSchema = z
  .object({
    mutationId: ulidSchema,
    status: z.enum(['applied', 'alreadyApplied', 'duplicate', 'conflict', 'rejected', 'retry']),
    version: z.number().int().nonnegative().optional(),
    operationId: ulidSchema.optional(),
  })
  .strict();

export const urgencyStackPushRequestSchema = z
  .object({
    contractVersion: urgencyStackRankingContractVersionSchema,
    mutations: z.array(urgencyStackMutationSchema).min(1).max(100),
  })
  .strict();

export const urgencyStackPushResponseSchema = z
  .object({ results: z.array(mutationResultSchema) })
  .strict();

export const problemSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    correlationId: z.string(),
  })
  .passthrough();

export const stackConflictProblemSchema = problemSchema.extend({
  reason: z.enum([
    'version_mismatch',
    'anchor_removed',
    'authorization_changed',
    'lifecycle_changed',
    'project_changed',
    'filter_basis_changed',
    'hard_deleted',
  ]),
  currentVersion: z.number().int().nonnegative(),
});
