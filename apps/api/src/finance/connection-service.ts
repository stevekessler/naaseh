import {
  createFinancialAccount,
  createFinancialTransaction,
  createImportJob,
  createUlid,
  transitionImportJob,
  type FinanceScope,
  type ImportJob,
  type parseSimplefinV2,
} from '@naaseh/domain';
import { FinanceMemoryRepository } from './repository.js';
import { DecryptCommand, EncryptCommand, KMSClient } from '@aws-sdk/client-kms';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { claimSimplefinAccessUrl } from './simplefin-client.js';
import { reconcileProviderImport } from './provider-reconciliation-service.js';

type ConnectionKms = Pick<KMSClient, 'send'>;
const connectionContext = (connectionId: string, contextVersion = 1) => ({
  purpose: 'naaseh-finance-connection',
  connectionId,
  contextVersion: String(contextVersion),
});

export async function encryptConnectionAccessUrl(
  connectionId: string,
  accessUrl: string,
  keyId: string,
  kms: ConnectionKms = new KMSClient({}),
) {
  const result = await kms.send(
    new EncryptCommand({
      KeyId: keyId,
      Plaintext: new TextEncoder().encode(accessUrl),
      EncryptionContext: connectionContext(connectionId),
    }),
  );
  if (!result.CiphertextBlob) throw new Error('KMS did not return Finance credential ciphertext.');
  return {
    encryptedAccessUrl: Buffer.from(result.CiphertextBlob).toString('base64'),
    credentialKeyId: keyId,
    credentialContextVersion: 1,
  };
}

export async function decryptConnectionAccessUrl(
  connectionId: string,
  encrypted: {
    encryptedAccessUrl: string;
    credentialKeyId: string;
    credentialContextVersion: number;
  },
  kms: ConnectionKms = new KMSClient({}),
) {
  const result = await kms.send(
    new DecryptCommand({
      KeyId: encrypted.credentialKeyId,
      CiphertextBlob: Buffer.from(encrypted.encryptedAccessUrl, 'base64'),
      EncryptionContext: connectionContext(connectionId, encrypted.credentialContextVersion),
    }),
  );
  if (!result.Plaintext) throw new Error('KMS did not return a Finance credential.');
  return new TextDecoder('utf-8', { fatal: true }).decode(result.Plaintext);
}

export async function claimSimplefinConnection(
  repository: FinanceMemoryRepository,
  input: {
    id: string;
    scope: FinanceScope;
    setupToken: string;
    allowedHosts: readonly string[];
    keyId: string;
  },
  dependencies: { kms?: ConnectionKms; fetcher?: typeof fetch } = {},
) {
  const accessUrl = await claimSimplefinAccessUrl(
    input.setupToken,
    input.allowedHosts,
    dependencies.fetcher,
  );
  const credential = await encryptConnectionAccessUrl(
    input.id,
    accessUrl,
    input.keyId,
    dependencies.kms,
  );
  const stored = {
    id: input.id,
    scope: input.scope,
    provider: 'simplefin-bridge' as const,
    status: 'active' as const,
    ...credential,
    version: 1,
  };
  repository.connections.set(input.id, stored);
  return {
    id: stored.id,
    scope: stored.scope,
    provider: stored.provider,
    status: stored.status,
    version: stored.version,
  };
}

type LambdaInvoker = Pick<LambdaClient, 'send'>;
export async function dispatchSimplefinRefresh(
  repository: FinanceMemoryRepository,
  connectionId: string,
  jobId: string,
  now = new Date(),
  lambda: LambdaInvoker = new LambdaClient({}),
  functionName = process.env.NAASEH_FINANCE_IMPORT_FUNCTION_NAME,
) {
  if (!functionName) throw new Error('Finance import function is not configured.');
  const job = queueRefreshJob(repository, connectionId, jobId, now);
  await lambda.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event',
      Payload: new TextEncoder().encode(JSON.stringify({ jobId, connectionId })),
    }),
  );
  return job;
}

export function queueRefreshJob(
  repository: FinanceMemoryRepository,
  connectionId: string,
  jobId: string,
  now = new Date(),
) {
  const existing = repository.importJobs.get(jobId);
  if (existing) return existing;
  const connection = repository.connections.get(connectionId);
  if (!connection || connection.status === 'revoked' || connection.status === 'archived') {
    throw new Error('Finance connection not found.');
  }
  assertRefreshCooldown(connection.lastAttemptAt as string | undefined, now);
  const window = boundedRefreshWindow(connection, now);
  const job = createImportJob(jobId, connectionId, window.startDate, window.endDate);
  repository.importJobs.set(jobId, job);
  repository.connections.set(connectionId, { ...connection, lastAttemptAt: now.toISOString() });
  return job;
}

export function refreshAllowedAt(lastAttemptAt: string): Date {
  return new Date(Date.parse(lastAttemptAt) + 60 * 60 * 1_000);
}

export function refreshWindowStart(lastSuccessfulStartDate: string): string {
  const date = new Date(`${lastSuccessfulStartDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 5);
  return date.toISOString().slice(0, 10);
}

export function boundedRefreshWindow(connection: Record<string, unknown>, now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const earliest = new Date(end);
  earliest.setUTCDate(earliest.getUTCDate() - 90);
  const overlap =
    typeof connection.lastSuccessfulStartDate === 'string'
      ? new Date(`${refreshWindowStart(connection.lastSuccessfulStartDate)}T00:00:00.000Z`)
      : earliest;
  const start = overlap < earliest ? earliest : overlap;
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

export function assertRefreshCooldown(lastAttemptAt: string | undefined, now = new Date()): void {
  if (lastAttemptAt && now < refreshAllowedAt(lastAttemptAt)) {
    throw new Error('SimpleFIN refresh cooldown is active.');
  }
}

export function acquireRefreshLease(
  repository: FinanceMemoryRepository,
  connectionId: string,
  jobId: string,
  now = new Date(),
) {
  const existing = repository.importJobs.get(jobId);
  if (existing) {
    if (existing.status === 'running') return existing;
    if (existing.status === 'queued') {
      const started = {
        ...transitionImportJob(existing, 'running'),
        startedAt: existing.startedAt ?? now.toISOString(),
        leaseUntil: new Date(now.getTime() + 5 * 60_000).toISOString(),
      };
      repository.importJobs.set(jobId, started);
      return started;
    }
    if (existing.status !== 'partial' && existing.status !== 'failed') return existing;
    const retried = {
      ...transitionImportJob(existing, 'running'),
      leaseUntil: new Date(now.getTime() + 5 * 60_000).toISOString(),
    };
    repository.importJobs.set(jobId, retried);
    return retried;
  }
  const connection = repository.connections.get(connectionId);
  assertRefreshCooldown(connection?.lastAttemptAt as string | undefined, now);
  const job = {
    ...transitionImportJob(createImportJob(jobId, connectionId), 'running'),
    startedAt: now.toISOString(),
    leaseUntil: new Date(now.getTime() + 5 * 60_000).toISOString(),
  };
  repository.importJobs.set(jobId, job);
  repository.connections.set(connectionId, {
    ...(connection ?? {}),
    lastAttemptAt: now.toISOString(),
  });
  return job;
}

export function completeRefreshJob(
  repository: FinanceMemoryRepository,
  jobId: string,
  status: Extract<ImportJob['status'], 'partial' | 'succeeded' | 'failed'>,
  counts: ImportJob['counts'],
) {
  const job = repository.importJobs.get(jobId);
  if (!job) throw new Error('Finance import job not found.');
  const completed = {
    ...transitionImportJob(job, status),
    counts,
    completedAt: new Date().toISOString(),
  };
  repository.importJobs.set(jobId, completed);
  return completed;
}

export function importSimplefinAccounts(
  repository: FinanceMemoryRepository,
  connectionId: string,
  scope: FinanceScope,
  payload: ReturnType<typeof parseSimplefinV2>,
) {
  let importedAccounts = 0;
  let attentionAccounts = 0;
  let importedTransactions = 0;
  for (const source of payload.accounts) {
    const providerAccountIdentity = `${source.providerConnectionId ?? 'legacy'}:${source.providerAccountId}`;
    if (source.needsIdentityCompletion || !source.sourceName || !source.organizationName) {
      repository.pendingSimplefinAccounts.set(`${connectionId}:${providerAccountIdentity}`, source);
      attentionAccounts += 1;
      continue;
    }
    const accountSourceId = `account:${providerAccountIdentity}`;
    let accountId = repository.sourceIdentities.get(`${connectionId}:${accountSourceId}`);
    if (!accountId) {
      accountId = createUlid();
      repository.claimSourceIdentity(connectionId, accountSourceId, accountId);
    }
    if (!repository.accounts.has(accountId)) {
      const account = createFinancialAccount({
        id: accountId,
        connectionId,
        scope,
        sourceName: source.sourceName,
        organizationName: source.organizationName,
        accountType: 'other',
        currency: source.currency,
        openingBalanceMinor: source.balanceMinor,
        ...(source.availableBalanceMinor === undefined
          ? {}
          : { availableBalanceMinor: source.availableBalanceMinor }),
        balanceAt: source.balanceAt,
      });
      repository.accounts.set(accountId, account);
      repository.balanceSnapshots.push({
        id: createUlid(),
        accountId,
        balanceMinor: source.balanceMinor,
        currency: account.currency,
        ...(source.availableBalanceMinor === undefined
          ? {}
          : { availableBalanceMinor: source.availableBalanceMinor }),
        currencyExponent: account.currencyExponent,
        effectiveAt: source.balanceAt,
        recordedAt: new Date().toISOString(),
        source: 'simplefin',
      });
      importedAccounts += 1;
    }
    for (const transaction of source.transactions) {
      const resolvedProviderConnectionId = source.providerConnectionId ?? connectionId;
      const transactionSourceId = `${resolvedProviderConnectionId}:${source.providerAccountId}:${transaction.sourceTransactionId}`;
      if (repository.sourceIdentities.has(`${connectionId}:${transactionSourceId}`)) continue;
      const transactionId = createUlid();
      const providerTransaction = createFinancialTransaction({
        id: transactionId,
        accountId,
        origin: 'simplefin',
        amountMinor: transaction.amountMinor,
        currency: source.currency,
        ...(transaction.transactedAt ? { transactedAt: transaction.transactedAt } : {}),
        ...(transaction.postedAt ? { postedAt: transaction.postedAt } : {}),
        description: transaction.description,
        ...(transaction.payee ? { payee: transaction.payee } : {}),
        pending: transaction.pending,
        connectedAccount: true,
        providerConnectionId: resolvedProviderConnectionId,
        providerAccountId: source.providerAccountId,
        sourceTransactionId: transaction.sourceTransactionId,
      });
      reconcileProviderImport(repository, providerTransaction, 'system');
      importedTransactions += 1;
    }
  }
  return { importedAccounts, attentionAccounts, importedTransactions };
}
