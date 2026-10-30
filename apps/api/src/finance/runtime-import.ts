import { parseSimplefinV2, transitionImportJob } from '@naaseh/domain';
import { DynamoFinanceRepository } from './durable-repository.js';
import {
  acquireRefreshLease,
  completeRefreshJob,
  decryptConnectionAccessUrl,
  importSimplefinAccounts,
} from './connection-service.js';
import { fetchSimplefinAccounts } from './simplefin-client.js';
import type { FinanceConnection } from '@naaseh/domain';

export async function runDurableFinanceImport(
  event: { jobId?: string; connectionId?: string; dispatchPending?: boolean },
  store = new DynamoFinanceRepository(),
) {
  if (event.dispatchPending) {
    const session = await store.load();
    // One scheduled invocation is bounded; remaining jobs stay durably queued.
    const jobs = [...session.repository.importDispatches.values()].slice(0, 1);
    for (const job of jobs) {
      try {
        await runDurableFinanceImport(job, store);
      } catch {
        /* persisted failure is available to the caller */
      }
    }
    return;
  }
  if (!event.jobId || !event.connectionId) throw new Error('Invalid Finance import job.');
  const { jobId, connectionId } = event;
  let session = await store.load();
  const job = session.repository.importJobs.get(jobId);
  const connection = session.repository.connections.get(connectionId) as unknown as
    | FinanceConnection
    | undefined;
  if (
    !job ||
    job.connectionId !== connectionId ||
    !connection ||
    ['revoked', 'archived'].includes(connection.status)
  ) {
    session.repository.importDispatches.delete(jobId);
    if (
      job &&
      job.connectionId === connectionId &&
      ['queued', 'running', 'partial'].includes(job.status)
    )
      session.repository.importJobs.set(jobId, transitionImportJob(job, 'cancelled'));
    await session.commit();
    throw new Error('Finance import job not found.');
  }
  if (job.status === 'succeeded' || job.status === 'cancelled') {
    session.repository.importDispatches.delete(jobId);
    await session.commit();
    return job;
  }
  acquireRefreshLease(session.repository, connectionId, jobId);
  await session.commit();
  try {
    const accessUrl = await decryptConnectionAccessUrl(connectionId, connection);
    const hosts = (
      process.env.NAASEH_SIMPLEFIN_ALLOWED_HOSTS ?? 'bridge.simplefin.org,beta-bridge.simplefin.org'
    )
      .split(',')
      .map((host) => host.trim());
    const raw = await fetchSimplefinAccounts(
      accessUrl,
      hosts,
      fetch,
      5_000_000,
      job.windowStart && job.windowEnd
        ? { startDate: job.windowStart, endDate: job.windowEnd }
        : undefined,
    );
    const payload = parseSimplefinV2(raw);
    const counts = {
      ...job.counts,
      accounts: payload.accounts.length,
      reviewIssues: Math.max(job.counts.reviewIssues, payload.errors.length),
    };
    const started = Date.now();
    let offset = 0;
    const resume = job.providerOffset ?? 0;
    for (const account of [...payload.accounts].sort((a, b) =>
      `${a.providerConnectionId}:${a.providerAccountId}`.localeCompare(
        `${b.providerConnectionId}:${b.providerAccountId}`,
      ),
    )) {
      account.transactions.sort((a, b) =>
        a.sourceTransactionId.localeCompare(b.sourceTransactionId),
      );
      const chunks = Array.from(
        { length: Math.max(1, Math.ceil(account.transactions.length / 5)) },
        (_, index) => account.transactions.slice(index * 5, (index + 1) * 5),
      );
      for (const transactions of chunks) {
        if (offset++ < resume) continue;
        if (Date.now() - started > 60_000) {
          const running = session.repository.importJobs.get(jobId)!;
          session.repository.importJobs.set(jobId, {
            ...running,
            leaseUntil: new Date(0).toISOString(),
          });
          await session.commit();
          return running;
        }
        const current = session.repository.connections.get(connectionId);
        if (
          !current ||
          ['revoked', 'archived'].includes(String(current.status)) ||
          current.version !== connection.version
        )
          throw new Error('Finance connection changed.');
        const imported = importSimplefinAccounts(
          session.repository,
          connectionId,
          connection.scope,
          { ...payload, accounts: [{ ...account, transactions }] },
        );
        counts.inserted += imported.importedTransactions;
        counts.updated += imported.updatedTransactions;
        counts.duplicateSuppressed += imported.duplicateSuppressed;
        if (!transactions.length || transactions === chunks[0])
          counts.reviewIssues += imported.attentionAccounts;
        const running = session.repository.importJobs.get(jobId)!;
        session.repository.importJobs.set(jobId, {
          ...running,
          counts: { ...counts },
          providerOffset: offset,
          leaseUntil: new Date(Date.now() + 300_000).toISOString(),
        });
        await session.commit();
      }
    }
    session = await store.load();
    const current = session.repository.connections.get(connectionId);
    if (
      !current ||
      ['revoked', 'archived'].includes(String(current.status)) ||
      current.version !== connection.version
    )
      throw new Error('Finance connection changed.');
    const partial = counts.reviewIssues > 0;
    const completed = completeRefreshJob(
      session.repository,
      jobId,
      partial ? 'partial' : 'succeeded',
      counts,
    );
    session.repository.connections.set(connectionId, {
      ...current,
      status: partial ? 'attention' : 'active',
      lastSuccessfulAt: new Date().toISOString(),
      version: connection.version + 1,
    });
    session.repository.importDispatches.delete(jobId);
    await session.commit();
    return completed;
  } catch {
    session = await store.load();
    const current = session.repository.importJobs.get(jobId);
    if (current?.status === 'running') {
      const failed = completeRefreshJob(session.repository, jobId, 'failed', current.counts);
      session.repository.importJobs.set(jobId, {
        ...failed,
        errors: [
          { class: 'provider-import', message: 'The provider import could not be completed.' },
        ],
      });
    }
    session.repository.importDispatches.delete(jobId);
    await session.commit();
    throw new Error('Finance import failed.');
  }
}
