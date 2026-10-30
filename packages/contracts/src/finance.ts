import { z } from 'zod';
import { financeLifecycleSchema, financeScopeSchema, ulidSchema } from '@naaseh/domain';

export const financeContractVersion = 1 as const;

export const financeCursorSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9._~-]+$/);
export const financeIdempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const financeProblemSchema = z
  .object({
    type: z.string().url(),
    title: z.string().min(1).max(200),
    status: z.number().int().min(400).max(599),
    code: z.string().min(1).max(100),
    correlationId: z.string().min(1).max(128),
    detail: z.string().min(1).max(500).optional(),
  })
  .strict();

export type FinanceProblem = z.infer<typeof financeProblemSchema>;

const accountTypeSchema = z.enum(['checking', 'savings', 'credit-card', 'loan', 'other']);

export const manualFinanceAccountInputSchema = z
  .object({
    scope: financeScopeSchema,
    sourceName: z.string().trim().min(1).max(200),
    organizationName: z.string().trim().min(1).max(200),
    friendlyName: z.string().trim().min(1).max(200).optional(),
    accountType: accountTypeSchema,
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default('USD'),
    openingBalanceMinor: z.number().int().safe(),
    availableBalanceMinor: z.number().int().safe().optional(),
    balanceAt: z.string().datetime(),
  })
  .strict()
  .transform((input) => ({
    ...input,
    friendlyName: input.friendlyName ?? `${input.organizationName} - ${input.sourceName}`,
  }));

export const financialAccountSchema = z
  .object({
    id: ulidSchema,
    scope: financeScopeSchema,
    connectionId: ulidSchema.optional(),
    sourceName: z.string().min(1).max(200),
    organizationName: z.string().min(1).max(200),
    friendlyName: z.string().min(1).max(200),
    accountType: accountTypeSchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    currencyExponent: z.number().int().min(0).max(6),
    currentBalanceMinor: z.number().int().safe(),
    availableBalanceMinor: z.number().int().safe().optional(),
    balanceAt: z.string().datetime(),
    status: financeLifecycleSchema,
    version: z.number().int().positive(),
  })
  .strict();

export const balanceSnapshotSchema = z
  .object({
    id: ulidSchema,
    accountId: ulidSchema,
    balanceMinor: z.number().int().safe(),
    availableBalanceMinor: z.number().int().safe().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    currencyExponent: z.number().int().min(0).max(6),
    effectiveAt: z.string().datetime(),
    recordedAt: z.string().datetime(),
    source: z.enum(['simplefin', 'manual']),
    importJobId: ulidSchema.optional(),
  })
  .strict();

export const transactionAllocationInputSchema = z
  .object({
    id: ulidSchema,
    amountMinor: z.number().int().safe(),
    financeCategoryId: ulidSchema,
    budgetItemId: ulidSchema.optional(),
    budgetId: ulidSchema.optional(),
    note: z.string().max(1000).optional(),
  })
  .strict();

export const transactionSourceSnapshotSchema = z
  .object({
    postedAt: z.string().datetime().nullable().optional(),
    transactedAt: z.string().datetime().optional(),
    amountMinor: z.number().int().safe(),
    description: z.string().trim().min(1).max(1000),
    payee: z.string().max(500).optional(),
    memo: z.string().max(4000).optional(),
    pending: z.boolean(),
    merchantCategoryCode: z.string().max(20).optional(),
  })
  .strict();

export const financialTransactionSchema = z
  .object({
    id: ulidSchema,
    accountId: ulidSchema,
    origin: z.enum(['simplefin', 'manual', 'csv']),
    csvImportBatchId: ulidSchema.optional(),
    csvRowOrdinal: z.number().int().min(1).max(50_000).optional(),
    sourceTransactionId: z.string().min(1).max(500).optional(),
    entrySnapshot: transactionSourceSnapshotSchema.optional(),
    providerSnapshot: transactionSourceSnapshotSchema.optional(),
    postedAt: z.string().datetime().nullable().optional(),
    transactedAt: z.string().datetime().optional(),
    amountMinor: z.number().int().safe(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    currencyExponent: z.number().int().min(0).max(6),
    description: z.string().trim().min(1).max(1000),
    payee: z.string().max(500).optional(),
    memo: z.string().max(4000).optional(),
    pending: z.boolean(),
    merchantCategoryCode: z.string().max(20).optional(),
    merchantId: ulidSchema.optional(),
    transferId: ulidSchema.optional(),
    allocations: z.array(transactionAllocationInputSchema).max(100),
    reconciliationState: z.enum([
      'not-applicable',
      'provisional',
      'reconciled',
      'review-required',
      'kept-separate',
    ]),
    reconciledAt: z.string().datetime().optional(),
    reconciledBy: z.string().min(1).max(200).optional(),
    reviewState: z.enum([
      'none',
      'identity-review',
      'allocation-review',
      'reconciliation-review',
      'possible-duplicate',
    ]),
    version: z.number().int().positive(),
  })
  .strict();

export const transactionPageSchema = z
  .object({
    items: z.array(financialTransactionSchema),
    cursor: financeCursorSchema.nullable(),
    totalsComplete: z.boolean(),
  })
  .strict();

export const transactionAllocationReplacementSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    allocations: z.array(transactionAllocationInputSchema).max(100),
  })
  .strict();

const providerReconciliationDecisionFields = {
  reviewIssueId: ulidSchema,
  candidateTransactionId: ulidSchema,
  expectedProvisionalVersion: z.number().int().positive(),
  expectedCandidateVersion: z.number().int().positive(),
  expectedReviewVersion: z.number().int().positive(),
};

export const providerReconciliationDecisionInputSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('reconcile'), ...providerReconciliationDecisionFields }).strict(),
  z
    .object({ decision: z.literal('keep-separate'), ...providerReconciliationDecisionFields })
    .strict(),
]);

export const manualFinanceTransactionInputSchema = z
  .object({
    amountMinor: z.number().int().safe(),
    transactedAt: z.string().datetime(),
    postedAt: z.string().datetime().optional(),
    description: z.string().trim().min(1).max(1000),
    payee: z.string().max(500).optional(),
    memo: z.string().max(4000).optional(),
    pending: z.boolean().default(false),
    merchantId: ulidSchema.optional(),
    allocations: z.array(transactionAllocationInputSchema).max(100).optional(),
  })
  .strict();

export const manualFinanceBalanceInputSchema = z
  .object({
    expectedAccountVersion: z.number().int().positive(),
    balanceMinor: z.number().int().safe(),
    availableBalanceMinor: z.number().int().safe().optional(),
    effectiveAt: z.string().datetime(),
  })
  .strict();

export const financeAccountPatchSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    friendlyName: z.string().trim().min(1).max(200).optional(),
    scope: financeScopeSchema.optional(),
    status: z.enum(['active', 'archived']).optional(),
  })
  .strict();

export const simplefinClaimInputSchema = z
  .object({
    setupToken: z.string().min(1).max(8192),
    scope: financeScopeSchema,
  })
  .strict();

const csvAmountMappingSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('signed'), amountColumn: z.string().min(1).max(200) }).strict(),
  z
    .object({
      mode: z.literal('debit-credit'),
      debitColumn: z.string().min(1).max(200),
      creditColumn: z.string().min(1).max(200),
    })
    .strict(),
]);

export const csvColumnMappingSchema = z
  .object({
    dateColumn: z.string().min(1).max(200),
    descriptionColumn: z.string().min(1).max(200),
    payeeColumn: z.string().min(1).max(200).optional(),
    memoColumn: z.string().min(1).max(200).optional(),
    dateFormat: z.enum(['YYYY-MM-DD', 'MM/DD/YYYY', 'M/D/YYYY']),
    amountMapping: csvAmountMappingSchema,
  })
  .strict();

const csvImportRowInputSchema = z
  .object({
    ordinal: z.number().int().min(1).max(50_000),
    amountMinor: z.number().int().safe(),
    transactedAt: z.string().datetime(),
    description: z.string().trim().min(1).max(1000),
    payee: z.string().max(500).optional(),
    memo: z.string().max(4000).optional(),
    duplicateDisposition: z.enum(['not-suspected', 'included-after-review']),
  })
  .strict();

export const csvImportChunkInputSchema = z
  .object({
    batchId: ulidSchema,
    fileDigest: z.string().regex(/^[0-9a-f]{64}$/),
    mapping: csvColumnMappingSchema,
    duplicateDecisionDigest: z.string().regex(/^[0-9a-f]{64}$/),
    duplicateReviewSummary: z
      .object({
        suspected: z.number().int().min(0).max(50_000),
        included: z.number().int().min(0).max(50_000),
        excluded: z.number().int().min(0).max(50_000),
        unresolved: z.literal(0),
      })
      .strict(),
    chunkIndex: z.number().int().min(0).max(499),
    finalChunk: z.boolean(),
    rows: z.array(csvImportRowInputSchema).min(1).max(100),
  })
  .strict();

export const financeConnectionSchema = z
  .object({
    id: ulidSchema,
    scope: financeScopeSchema,
    provider: z.literal('simplefin-bridge'),
    status: z.enum(['active', 'attention', 'revoked', 'archived']),
    lastAttemptAt: z.string().datetime().optional(),
    lastSuccessfulAt: z.string().datetime().optional(),
    lastErrorClass: z
      .enum([
        'provider-authentication',
        'provider-payment-required',
        'provider-partial',
        'provider-throttled',
        'provider-unavailable',
        'internal',
      ])
      .optional(),
    version: z.number().int().positive(),
  })
  .strict();

export const importJobSchema = z
  .object({
    id: ulidSchema,
    connectionId: ulidSchema,
    status: z.enum(['queued', 'running', 'partial', 'succeeded', 'failed', 'cancelled']),
    windowStart: z.string().date().optional(),
    windowEnd: z.string().date().optional(),
    counts: z
      .object({
        accounts: z.number().int().nonnegative(),
        inserted: z.number().int().nonnegative(),
        updated: z.number().int().nonnegative(),
        duplicateSuppressed: z.number().int().nonnegative(),
        reviewIssues: z.number().int().nonnegative(),
      })
      .strict(),
    errors: z
      .array(z.object({ class: z.string().max(100), message: z.string().max(500) }).strict())
      .max(100)
      .optional(),
    attempts: z.number().int().nonnegative(),
    startedAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
  })
  .strict();

export const financeCategoryInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
  })
  .strict();

export const financeCategoryPatchSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    name: z.string().trim().min(1).max(100).optional(),
    status: z.enum(['active', 'archived']).optional(),
  })
  .strict();

export const financeCategorySchema = z
  .object({
    id: ulidSchema,
    name: z.string().min(1).max(100),
    origin: z.enum(['bank', 'user']),
    merchantCategoryCode: z.string().max(20).optional(),
    creatorId: z.string().max(200).optional(),
    status: z.enum(['active', 'archived']),
    version: z.number().int().positive(),
  })
  .strict();

export const financeCategoryListSchema = z
  .object({
    items: z.array(financeCategorySchema),
  })
  .strict();

export const financeMerchantInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    city: z.string().max(120).optional(),
    region: z.string().max(120).optional(),
    merchantCategoryCode: z.string().max(20).optional(),
    financeCategoryId: ulidSchema.optional(),
  })
  .strict();

export const financeMerchantSchema = z
  .object({
    id: ulidSchema,
    name: z.string().min(1).max(200),
    city: z.string().max(120).optional(),
    region: z.string().max(120).optional(),
    merchantCategoryCode: z.string().max(20).optional(),
    financeCategoryId: ulidSchema.optional(),
    source: z.enum(['imported', 'manual', 'merged']),
    creatorId: z.string().max(200).optional(),
    status: z.enum(['active', 'archived', 'merged']),
    mergedIntoId: ulidSchema.optional(),
    version: z.number().int().positive(),
  })
  .strict();

export const financeMerchantPageSchema = z
  .object({
    items: z.array(financeMerchantSchema),
    cursor: financeCursorSchema.nullable(),
  })
  .strict();

export const financeMerchantActivitySchema = z
  .object({
    merchant: financeMerchantSchema,
    transactions: z.array(financialTransactionSchema),
    totalsComplete: z.literal(true),
    cursor: financeCursorSchema.nullable().optional(),
  })
  .strict();

const financeDateSchema = z.string().date();
const budgetPeriodFields = {
  budgetDate: financeDateSchema,
  startDate: financeDateSchema,
  endDate: financeDateSchema.nullable().optional(),
};
const validBudgetPeriod = (value: {
  startDate?: string | undefined;
  endDate?: string | null | undefined;
}) =>
  value.endDate === undefined ||
  value.endDate === null ||
  value.startDate === undefined ||
  value.endDate >= value.startDate;

export const financeBudgetInputSchema = z
  .object({
    groupId: ulidSchema,
    name: z.string().trim().min(1).max(200),
    ...budgetPeriodFields,
    status: z.enum(['draft', 'active', 'archived']).optional(),
  })
  .strict()
  .refine(validBudgetPeriod, {
    message: 'Budget end date cannot be before its start date.',
    path: ['endDate'],
  });

export const financeBudgetPatchSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    name: z.string().trim().min(1).max(200).optional(),
    budgetDate: financeDateSchema.optional(),
    startDate: financeDateSchema.optional(),
    endDate: financeDateSchema.nullable().optional(),
    status: z.enum(['draft', 'active', 'archived']).optional(),
  })
  .strict()
  .refine(validBudgetPeriod, {
    message: 'Budget end date cannot be before its start date.',
    path: ['endDate'],
  });

export const financeBudgetAccountLinkInputSchema = z
  .object({
    id: ulidSchema.optional(),
    accountId: ulidSchema,
    expectedBudgetVersion: z.number().int().positive(),
  })
  .strict();

export const financeBudgetItemInputSchema = z
  .object({
    id: ulidSchema.optional(),
    expectedBudgetVersion: z.number().int().positive(),
    sourceReusableItemId: ulidSchema.optional(),
    description: z.string().trim().min(1).max(300),
    merchantId: ulidSchema.optional(),
    financeCategoryId: ulidSchema,
    plannedAmountMinor: z
      .number()
      .int()
      .safe()
      .refine((value) => value !== 0),
    currency: z.string().regex(/^[A-Z]{3}$/),
    currencyExponent: z.number().int().min(0).max(6),
    applicableDate: financeDateSchema.optional(),
    relatedAccountIds: z
      .array(ulidSchema)
      .max(50)
      .refine((values) => new Set(values).size === values.length),
  })
  .strict();

export const financeBudgetCurrencyTotalSchema = z
  .object({
    currency: z.string().regex(/^[A-Z]{3}$/),
    currencyExponent: z.number().int().min(0).max(6),
    plannedMinor: z.number().int().safe(),
    actualMinor: z.number().int().safe(),
    varianceMinor: z.number().int().safe(),
  })
  .strict();

export const financeBudgetItemSchema = z
  .object({
    id: ulidSchema,
    budgetId: ulidSchema.optional(),
    sourceReusableItemId: ulidSchema.optional(),
    description: z.string().min(1).max(300),
    merchantId: ulidSchema.optional(),
    financeCategoryId: ulidSchema,
    plannedAmountMinor: z.number().int().safe(),
    actualAmountMinor: z.number().int().safe().optional(),
    varianceMinor: z.number().int().safe().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    currencyExponent: z.number().int().min(0).max(6),
    applicableDate: financeDateSchema.optional(),
    relatedAccountIds: z.array(ulidSchema).max(50),
    creatorId: z.string().min(1).max(200),
    status: z.enum(['active', 'archived', 'tombstone']),
    version: z.number().int().positive(),
  })
  .strict();

export const financeBudgetAccountLinkSchema = z
  .object({
    id: z.string().min(1),
    budgetId: ulidSchema.optional(),
    accountId: ulidSchema,
    status: z.enum(['active', 'removed']),
    version: z.number().int().positive(),
  })
  .strict();

export const financeBudgetReconciliationInputSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const financeReconciliationRecordSchema = z
  .object({
    id: ulidSchema,
    budgetId: ulidSchema,
    reconciledAt: z.string().datetime(),
    reconciledBy: z.string().min(1).max(200),
    budgetVersion: z.number().int().positive(),
    sourceVersionDigest: z.string().regex(/^[a-f0-9]{64}$/u),
    totalsByCurrency: z.array(financeBudgetCurrencyTotalSchema).max(1_000),
    totalsByCategory: z
      .array(
        financeBudgetCurrencyTotalSchema
          .extend({
            financeCategoryId: ulidSchema,
          })
          .strict(),
      )
      .max(1_000),
  })
  .strict();

export const financeBudgetDetailSchema = z
  .object({
    id: ulidSchema,
    groupId: ulidSchema,
    name: z.string().min(1).max(200),
    ...budgetPeriodFields,
    status: z.enum(['draft', 'active', 'changed-since-reconciliation', 'archived']),
    accountLinks: z.array(financeBudgetAccountLinkSchema).optional(),
    items: z.array(financeBudgetItemSchema),
    totals: z.array(financeBudgetCurrencyTotalSchema),
    categoryTotals: z
      .array(financeBudgetCurrencyTotalSchema.extend({ financeCategoryId: ulidSchema }))
      .optional(),
    totalsComplete: z.boolean(),
    reconciliationReadiness: z
      .object({
        canReconcile: z.boolean(),
        reasons: z.array(z.string().min(1).max(300)).max(10),
      })
      .strict()
      .optional(),
    reconciliations: z.array(financeReconciliationRecordSchema).max(1_000).optional(),
    lastReconciledAt: z.string().datetime().optional(),
    version: z.number().int().positive(),
  })
  .strict();

export const financeBudgetPageSchema = z
  .object({
    items: z.array(financeBudgetDetailSchema),
    cursor: financeCursorSchema.nullable(),
  })
  .strict();

export const financeReusableRecurrenceSchema = z
  .object({
    interval: z.number().int().min(1).max(366),
    unit: z.enum(['day', 'week', 'month', 'year']),
    startDate: financeDateSchema,
    endDate: financeDateSchema.optional(),
  })
  .strict()
  .refine((value) => value.endDate === undefined || value.endDate >= value.startDate, {
    message: 'Recurrence end date cannot precede its start date.',
    path: ['endDate'],
  });

const reusableItemFields = {
  groupId: ulidSchema,
  description: z.string().trim().min(1).max(300),
  merchantId: ulidSchema.optional(),
  financeCategoryId: ulidSchema,
  plannedAmountMinor: z
    .number()
    .int()
    .safe()
    .refine((value) => value !== 0),
  currency: z.string().regex(/^[A-Z]{3}$/),
  currencyExponent: z.number().int().min(0).max(6),
  relatedAccountIds: z
    .array(ulidSchema)
    .max(50)
    .refine((values) => new Set(values).size === values.length),
  applicableDate: financeDateSchema.optional(),
  recurrence: financeReusableRecurrenceSchema.optional(),
};
const oneReusableSchedule = (value: {
  applicableDate?: string | undefined;
  recurrence?: unknown;
}) => !(value.applicableDate && value.recurrence);

export const financeReusableItemInputSchema = z
  .object(reusableItemFields)
  .strict()
  .refine(oneReusableSchedule, { message: 'Choose one applicable date or recurrence.' });

export const financeReusableItemSchema = z
  .object({
    id: ulidSchema,
    ...reusableItemFields,
    status: z.enum(['active', 'archived', 'tombstone']),
    creatorId: z.string().min(1).max(200),
    version: z.number().int().positive(),
  })
  .strict()
  .refine(oneReusableSchedule, { message: 'Choose one applicable date or recurrence.' });

export const financeReusableItemPageSchema = z
  .object({
    items: z.array(financeReusableItemSchema),
    cursor: financeCursorSchema.nullable().optional(),
  })
  .strict();

export const financeReusableCopyInputSchema = z
  .object({
    occurrenceDate: financeDateSchema,
    expectedBudgetVersion: z.number().int().positive(),
    budgetItemId: ulidSchema.optional(),
  })
  .strict();

export const financeTransactionMatchScoreSchema = z
  .object({
    merchant: z.boolean(),
    date: z.boolean(),
    account: z.boolean(),
    amountDifferencePercent: z.number().min(0).max(100_000),
  })
  .strict();

export const financeTransactionMatchSchema = z
  .object({
    id: ulidSchema,
    transactionId: z.string().min(1),
    budgetItemId: ulidSchema,
    budgetId: ulidSchema.optional(),
    kind: z.enum(['exact', 'near', 'manual']),
    scoreBasis: financeTransactionMatchScoreSchema,
    status: z.enum(['suggested', 'accepted', 'rejected', 'undone', 'invalidated', 'tombstone']),
    decidedBy: z.string().min(1).max(200).optional(),
    decidedAt: z.string().datetime().optional(),
    version: z.number().int().positive(),
  })
  .strict();

export const financeTransactionMatchDecisionSchema = z
  .object({
    decision: z.enum(['accept', 'reject', 'undo']),
    expectedVersion: z.number().int().positive(),
    expectedTransactionVersion: z.number().int().positive(),
  })
  .strict();

export const financeTaskCreateInputSchema = z
  .object({
    budgetId: ulidSchema.optional(),
    label: z.string().trim().min(1).max(300),
    assigneeId: z.string().min(1).max(200),
    dueDate: financeDateSchema.optional(),
  })
  .strict();

export const financialTaskLinkSchema = z
  .object({
    id: ulidSchema,
    budgetId: ulidSchema,
    budgetItemId: ulidSchema,
    taskId: ulidSchema,
    financeAudience: z.string().regex(/^GROUP#[^#]+$/u),
    createdBy: z.string().min(1).max(200),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    status: z.enum(['active', 'removed']),
    version: z.number().int().positive(),
  })
  .strict();

export const financeTaskCreateResponseSchema = z
  .object({
    taskId: ulidSchema,
    financialTaskLinkId: ulidSchema,
  })
  .strict();

const deletionRecordTypeSchema = z.enum([
  'account',
  'transaction',
  'budget',
  'reusable-item',
  'match',
  'task-link',
  'merchant',
  'category',
]);
export const financeDeletionPreviewSchema = z
  .object({
    recordType: deletionRecordTypeSchema,
    recordId: ulidSchema,
    expectedVersion: z.number().int().positive(),
    outcome: z.enum(['archive', 'tombstone', 'permanent-delete']),
    dependentCounts: z.record(z.string(), z.number().int().nonnegative()),
    preservedRecordTypes: z.array(z.string().min(1).max(100)).max(20),
    confirmationToken: z.string().min(1).max(2048),
    expiresAt: z.string().datetime(),
  })
  .strict();

export const financeDeletionConfirmationSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    confirmationToken: z.string().min(1).max(2048),
  })
  .strict();

const financeEntityBaseSchema = z.object({
  id: ulidSchema,
  version: z.number().int().positive(),
});

export const financeSyncEntitySchema = z.discriminatedUnion('entityType', [
  financeEntityBaseSchema.extend({ entityType: z.literal('financeAccount') }).passthrough(),
  financeEntityBaseSchema.extend({ entityType: z.literal('financeBalanceSnapshot') }).passthrough(),
  financeEntityBaseSchema.extend({ entityType: z.literal('financeTransaction') }).passthrough(),
  financeEntityBaseSchema.extend({ entityType: z.literal('financeCategory') }).passthrough(),
  financeEntityBaseSchema.extend({ entityType: z.literal('financeMerchant') }).passthrough(),
  financeEntityBaseSchema.extend({ entityType: z.literal('financeBudget') }).passthrough(),
  financeEntityBaseSchema
    .extend({ entityType: z.literal('financeBudgetAccountLink') })
    .passthrough(),
  financeEntityBaseSchema.extend({ entityType: z.literal('financeBudgetItem') }).passthrough(),
  financeEntityBaseSchema.extend({ entityType: z.literal('financeReusableItem') }).passthrough(),
  financeEntityBaseSchema
    .extend({ entityType: z.literal('financeTransactionMatch') })
    .passthrough(),
  financeEntityBaseSchema.extend({ entityType: z.literal('financeReconciliation') }).passthrough(),
  financeEntityBaseSchema.extend({ entityType: z.literal('financeTaskLink') }).passthrough(),
  financeEntityBaseSchema.extend({ entityType: z.literal('financeReviewIssue') }).passthrough(),
]);
