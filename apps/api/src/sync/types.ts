import { z } from 'zod';
import {
  compatibleMutationResultSchema,
  normalizeMutationResult,
  type ContractV4MutationResult,
} from '@naaseh/domain';

export const compatibleSyncMutationResultsEnvelopeSchema = z
  .object({ results: z.array(compatibleMutationResultSchema) })
  .strict();

export interface SyncMutationResultsEnvelope {
  results: ContractV4MutationResult[];
}

export const financeSyncContractVersion = 8 as const;

/** Foundation decision primitive; the protected sync lane enforces it before reading/acknowledging. */
export function financeDeliveryDecision(input: {
  contractVersion: number;
  requirePin: boolean;
  unlocked: boolean;
}) {
  if (input.requirePin && input.contractVersion < financeSyncContractVersion)
    return { allowed: false as const, reason: 'finance_upgrade_required' as const };
  if (input.requirePin && !input.unlocked)
    return { allowed: false as const, reason: 'finance_unlock_required' as const };
  return { allowed: true as const };
}
export const financeSyncEntityTypes = [
  'financeAccount',
  'financeBalanceSnapshot',
  'financeTransaction',
  'financeAllocation',
  'financeTransfer',
  'financeCategory',
  'financeMerchant',
  'financeBudget',
  'financeBudgetAccountLink',
  'financeBudgetItem',
  'financeReusableItem',
  'financeTransactionMatch',
  'financeReconciliation',
  'financeTaskLink',
  'financeReviewIssue',
  'financeUpcomingExpense',
  'financeFulfillment',
  'financeReceipt',
  'financeDashboardPreference',
  'financeRefundRelationship',
] as const;

export type FinanceSyncEntityType = (typeof financeSyncEntityTypes)[number];
export const isFinanceSyncEntityType = (value: string): value is FinanceSyncEntityType =>
  financeSyncEntityTypes.includes(value as FinanceSyncEntityType);

export function parseSyncMutationResultsEnvelope(value: unknown): SyncMutationResultsEnvelope {
  const envelope = compatibleSyncMutationResultsEnvelopeSchema.parse(value);
  return { results: envelope.results.map(normalizeMutationResult) };
}

export {
  contractV4MutationResultSchema,
  stackConflictReasonSchema,
  supportedSyncContractVersionSchema,
  syncConflictEnvelopeSchema,
  syncRetryEnvelopeSchema,
  journalMutationSchema,
  journalEntryCiphertextSchema,
  ciphertextEnvelopeSchema,
} from '@naaseh/domain';
export type {
  ContractV4MutationResult,
  StackConflictReason,
  SupportedSyncContractVersion,
  SyncConflictEnvelope,
  SyncRetryEnvelope,
} from '@naaseh/domain';
