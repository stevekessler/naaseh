import {
  createFinanceUnlockGuard,
  type FinanceGateContext,
} from '../finance/finance-unlock-guard.js';
import { resolveReceiptTransaction } from '../finance/receipt-transaction-source.js';
import { FinanceSyncSourceGuard } from '../finance/sync-source-guard.js';
import { SafeApiError } from '../shared/http.js';

const unlock = createFinanceUnlockGuard();

/** Keep Finance receipt authorization out of generic attachment dispatch and feeds. */
export async function authorizeReceiptRequest(gate: FinanceGateContext, role: 'admin' | 'user') {
  const visit = await unlock(gate);
  const authorize = async (transactionId: string, action: 'read' | 'edit' = 'read') => {
    const source = new FinanceSyncSourceGuard({ userId: gate.userId, role });
    let transaction: Record<string, unknown> | undefined =
      (await source.readTransactionForBrowsing(transactionId)) ??
      (await source.readCanonicalSource('financeTransaction', transactionId));
    const resolved = transaction ? undefined : await resolveReceiptTransaction(transactionId);
    if (resolved?.transferred) {
      transaction =
        (await source.readTransactionForBrowsing(resolved.id)) ??
        (await source.readCanonicalSource('financeTransaction', resolved.id));
    }
    if (
      !transaction ||
      (transaction.status !== 'active' && (action === 'edit' || transaction.status !== 'archived'))
    )
      throw new SafeApiError(404, 'receipt_not_found', 'Receipt not found.', 'not_found');
    const assertCurrent = async () => {
      if (resolved?.transferred) {
        const current = await resolveReceiptTransaction(transactionId);
        if (current?.id !== resolved.id || current.scopeRevision !== resolved.scopeRevision)
          throw new SafeApiError(
            409,
            'receipt_source_changed',
            'Refresh the transaction and try again.',
            'conflict',
          );
      }
      await source.assertCurrent();
      const latest = await unlock(gate);
      if (
        latest.securityRevision !== visit.securityRevision ||
        latest.sessionEpoch !== visit.sessionEpoch
      )
        throw new SafeApiError(
          403,
          'finance_locked',
          'Unlock Finance to continue.',
          'authorization',
        );
    };
    await assertCurrent();
    return Object.assign(assertCurrent, { transaction, source });
  };
  return Object.assign(authorize, {
    securityRevision: visit.securityRevision,
    assertUnlocked: () => unlock(gate),
  });
}
