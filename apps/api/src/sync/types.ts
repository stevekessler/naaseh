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
} from '@naaseh/domain';
export type {
  ContractV4MutationResult,
  StackConflictReason,
  SupportedSyncContractVersion,
  SyncConflictEnvelope,
  SyncRetryEnvelope,
} from '@naaseh/domain';
