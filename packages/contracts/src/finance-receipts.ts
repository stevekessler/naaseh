import { attachmentSchema, MAX_FINANCE_RECEIPT_BYTES, ulidSchema } from '@naaseh/domain';
import { z } from 'zod';

export const financeReceiptUploadSchema = z
  .object({
    filename: z.string().min(1).max(255),
    mediaType: z.string().max(255),
    sizeBytes: z.number().int().min(1).max(MAX_FINANCE_RECEIPT_BYTES),
    checksumSha256: z.string().regex(/^(?:[a-f0-9]{64}|[A-Za-z0-9+/]{43}=)$/iu),
    clientReceiptId: ulidSchema,
  })
  .strict();

const pinnedReceiptSchema = z
  .object({
    uploadSessionId: ulidSchema,
    objectVersionId: z
      .string()
      .min(1)
      .max(1024)
      .refine((id) => id !== 'null' && id !== 'unknown'),
    etag: z
      .string()
      .max(256)
      .regex(/^"[^"\r\n]+"$/u),
  })
  .strict();

export const financeReceiptCompleteSchema = z.union([
  pinnedReceiptSchema,
  z.object({ uploadSessionId: ulidSchema, recover: z.literal(true) }).strict(),
]);

export const financeReceiptRetrySchema = z
  .object({
    expectedVersion: z.number().int().positive().safe(),
  })
  .strict();

export const financeReceiptViewSchema = attachmentSchema.safeExtend({
  parentType: z.literal('financeTransaction'),
  etag: z.string().optional(),
  transactionDate: z.string().optional(),
  transactionDescription: z.string().optional(),
  merchant: z.string().optional(),
  classifications: z
    .array(z.object({ category: z.string().optional(), subcategory: z.string().optional() }))
    .optional(),
  budgets: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
});

export const financeReceiptPageSchema = z.object({
  items: z.array(financeReceiptViewSchema).max(50),
  nextCursor: z.string().optional(),
});

export type FinanceReceiptView = z.infer<typeof financeReceiptViewSchema>;
