import type { Handler } from 'aws-lambda';
import { parseSimplefinV2, type FinanceConnection } from '@naaseh/domain';
import { log, metric } from '@naaseh/observability';
import {
  acquireRefreshLease,
  completeRefreshJob,
  decryptConnectionAccessUrl,
  importSimplefinAccounts,
} from './connection-service.js';
import { fetchSimplefinAccounts } from './simplefin-client.js';
import { FinanceMemoryRepository } from './repository.js';

export interface FinanceImportEvent {
  jobId: string;
  connectionId: string;
}

export interface FinanceImportDependencies {
  repository: FinanceMemoryRepository;
  allowedHosts: readonly string[];
  kms?: Parameters<typeof decryptConnectionAccessUrl>[2];
  fetcher?: typeof fetch;
  now?: () => Date;
}

const providerErrorClass = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('authentication')) return 'provider-authentication';
  if (message.includes('payment-required')) return 'provider-payment-required';
  if (message.includes('throttled')) return 'provider-throttled';
  if (message.includes('unavailable')) return 'provider-unavailable';
  return 'internal';
};

export async function executeFinanceImport(
  event: FinanceImportEvent,
  dependencies: FinanceImportDependencies,
) {
  if (!event.jobId || !event.connectionId) throw new Error('Invalid Finance import job.');
  const connection = dependencies.repository.connections.get(event.connectionId) as
    | (FinanceConnection & {
        encryptedAccessUrl: string;
        credentialKeyId: string;
        credentialContextVersion: number;
      })
    | undefined;
  if (!connection || connection.status === 'revoked' || connection.status === 'archived') {
    throw new Error('Finance connection not found.');
  }
  const now = dependencies.now?.() ?? new Date();
  acquireRefreshLease(dependencies.repository, event.connectionId, event.jobId, now);
  try {
    const accessUrl = await decryptConnectionAccessUrl(
      event.connectionId,
      connection,
      dependencies.kms,
    );
    const jobWindow = dependencies.repository.importJobs.get(event.jobId);
    const raw = await fetchSimplefinAccounts(
      accessUrl,
      dependencies.allowedHosts,
      dependencies.fetcher,
      5_000_000,
      jobWindow?.windowStart && jobWindow.windowEnd
        ? { startDate: jobWindow.windowStart, endDate: jobWindow.windowEnd }
        : undefined,
    );
    const payload = parseSimplefinV2(raw);
    const imported = importSimplefinAccounts(
      dependencies.repository,
      event.connectionId,
      connection.scope,
      payload,
    );
    const partial = payload.errors.length > 0 || imported.attentionAccounts > 0;
    const counts = {
      accounts: imported.importedAccounts + imported.attentionAccounts,
      inserted: imported.importedTransactions,
      updated: 0,
      duplicateSuppressed: 0,
      reviewIssues: imported.attentionAccounts + payload.errors.length,
    };
    const job = completeRefreshJob(
      dependencies.repository,
      event.jobId,
      partial ? 'partial' : 'succeeded',
      counts,
    );
    dependencies.repository.connections.set(event.connectionId, {
      ...connection,
      status: partial ? 'attention' : 'active',
      lastSuccessfulAt: now.toISOString(),
      lastSuccessfulStartDate: job.windowStart ?? now.toISOString().slice(0, 10),
      ...(partial ? { lastErrorClass: 'provider-partial' } : {}),
      version: connection.version + 1,
    });
    log('finance.import.completed', {
      operation: 'finance.import',
      outcome: partial ? 'partial' : 'success',
      jobId: event.jobId,
      connectionId: event.connectionId,
      accountCount: counts.accounts,
      insertedCount: counts.inserted,
    });
    metric('FinanceImportCompletions', 1, 'Count', { outcome: partial ? 'partial' : 'success' });
    return job;
  } catch (error) {
    const errorClass = providerErrorClass(error);
    const job = dependencies.repository.importJobs.get(event.jobId);
    if (job?.status === 'running') {
      const failed = completeRefreshJob(dependencies.repository, event.jobId, 'failed', job.counts);
      dependencies.repository.importJobs.set(event.jobId, {
        ...failed,
        errors: [{ class: errorClass, message: 'The provider import could not be completed.' }],
      });
    }
    dependencies.repository.connections.set(event.connectionId, {
      ...connection,
      status: 'attention',
      lastErrorClass: errorClass,
      version: connection.version + 1,
    });
    log('finance.import.failed', {
      operation: 'finance.import',
      outcome: 'failure',
      jobId: event.jobId,
      connectionId: event.connectionId,
      errorClass,
    });
    metric('FinanceImportFailures', 1, 'Count', { errorClass });
    throw error;
  }
}

export function createFinanceImportHandler(
  dependencies: FinanceImportDependencies,
): Handler<FinanceImportEvent> {
  return (event) => executeFinanceImport(event, dependencies);
}

const runtimeRepository = new FinanceMemoryRepository();
export const handler = createFinanceImportHandler({
  repository: runtimeRepository,
  allowedHosts: (
    process.env.NAASEH_SIMPLEFIN_ALLOWED_HOSTS ?? 'bridge.simplefin.org,beta-bridge.simplefin.org'
  )
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
});
