import { z } from 'zod';
export const financePublicationIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const financePublicationWorkerEnvelopeSchema = z
  .object({
    kind: z.literal('naaseh.finance.publication-worker'),
    publicationId: financePublicationIdSchema,
  })
  .strict();
export const financePublicationEventSource = 'naaseh.finance.publication';
export const financePublicationRecoveryEnvelopeSchema = z
  .object({ kind: z.literal('naaseh.finance.publication-recovery') })
  .strict();
export const financePublicationEventType = 'FinancePublicationRequested';
// Both normal and scheduled events have source/detail; no missing JSON-path fallback is needed.
export const financePublicationSignalEnvelopeSchema = z.discriminatedUnion('source', [
  z
    .object({
      kind: z.literal('naaseh.finance.publication-signal'),
      source: z.literal(financePublicationEventSource),
      detail: z.object({ publicationId: financePublicationIdSchema }).strict(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('naaseh.finance.publication-signal'),
      source: z.literal('aws.events'),
      detail: z.object({}).strict(),
    })
    .strict(),
]);
