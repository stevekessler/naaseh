import { z } from 'zod';
import { ulidSchema } from '@naaseh/domain';
import type { FinanceUnitOfWork } from './unit-of-work.js';
import { isFinanceScopePartition } from './publication-change-journal.js';
import { FinanceExperienceFailure } from './telemetry.js';
const schema = z
  .object({
    PK: z.string(),
    SK: z.literal('CURRENT'),
    format: z.literal('finance-publication-account-birth-v1'),
    accountId: ulidSchema,
    publicationId: z.string().regex(/^[a-f0-9]{64}$/),
    scopePK: z.string().refine(isFinanceScopePartition),
  })
  .strict();
/** A private pointer distinguishes a current birth from an earlier lifecycle's pending job. */
export async function assertCurrentFinanceAccountBirth(
  work: FinanceUnitOfWork,
  accountId: string,
  publicationId: string,
  scopePK: string,
  required = false,
) {
  const key = { PK: `FINANCE#PUBLICATION_ACCOUNT_BIRTH#${accountId}`, SK: 'CURRENT' },
    row = await work.get(key);
  if (!row && !required) return;
  const parsed = schema.safeParse(row);
  if (
    !parsed.success ||
    parsed.data.PK !== key.PK ||
    parsed.data.accountId !== accountId ||
    parsed.data.publicationId !== publicationId ||
    parsed.data.scopePK !== scopePK
  )
    throw new FinanceExperienceFailure(
      'invariant',
      'Finance current account birth proof does not match this creation.',
    );
}
