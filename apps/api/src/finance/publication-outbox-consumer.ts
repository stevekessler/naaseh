import { FinanceUnitOfWork } from './unit-of-work.js';
import { FinanceAccountPublicationConsumer } from './account-publication-consumer.js';
import { FinancePublicationImpactReader } from './publication-impact-reader.js';
import { initializeFinanceProjectionAccount } from './account-publication-bootstrap.js';
import {
  loadFinancePublicationManifest,
  financePublicationArchiveKey,
  financePublicationArchiveFormat,
  type FinancePublicationManifest,
} from './publication-journal-reader.js';
import { FinanceExperienceFailure } from './telemetry.js';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { financePublicationDeletionKey } from './publication-deletion-proof.js';
import { ulidSchema } from '@naaseh/domain';
import { FinanceAccountRetirement, isFinanceAccountRetired } from './account-retirement.js';
import { financePublicationAccountDeletionKey } from './publication-deletion-proof.js';

const recordKey = z.object({ PK: z.string().max(200), SK: z.string().max(200) }).strict();
const jobSchema = z
  .object({
    version: z.literal(1),
    publicationId: z.string().regex(/^[a-f0-9]{64}$/),
    phase: z.enum(['direct', 'scopes', 'complete']),
    directOffset: z.number().int().min(0).max(100),
    scopeOffset: z.number().int().min(0).max(100),
    cursor: recordKey.optional(),
    queue: z.array(ulidSchema).max(5).optional(),
    queueNext: recordKey.optional(),
    queueLast: z.boolean().optional(),
  })
  .strict();
type Job = z.infer<typeof jobSchema>;
const retentionSeconds = 30 * 86400;
const fail = (message: string): never => {
  throw new FinanceExperienceFailure('invariant', message);
};

/** One bounded account/discovery action. Pending records never expire; no invocation side effects here. */
export class FinancePublicationOutboxConsumer {
  private readonly factory: () => FinanceUnitOfWork;
  private readonly account: Pick<FinanceAccountPublicationConsumer, 'step'>;
  private readonly impact: Pick<FinancePublicationImpactReader, 'accounts'>;
  constructor(
    options: {
      work?: () => FinanceUnitOfWork;
      account?: Pick<FinanceAccountPublicationConsumer, 'step'>;
      impact?: Pick<FinancePublicationImpactReader, 'accounts'>;
    } = {},
  ) {
    this.factory = options.work ?? (() => new FinanceUnitOfWork());
    this.account = options.account ?? new FinanceAccountPublicationConsumer({ work: this.factory });
    this.impact = options.impact ?? new FinancePublicationImpactReader();
  }
  async step(id: string): Promise<{ complete: boolean }> {
    if (!/^[a-f0-9]{64}$/.test(id)) return fail('Finance publication identity is invalid.');
    const work = this.factory(),
      key = { PK: `FINANCE#PUBLICATION_JOB#${id}`, SK: 'CURRENT' };
    const stored = await work.get(key);
    let job: Job;
    if (stored) {
      const parsed = jobSchema.safeParse(stored.data);
      if (!parsed.success || parsed.data.publicationId !== id)
        return fail('Finance publication checkpoint format is invalid.');
      job = parsed.data;
    } else
      job = { version: 1, publicationId: id, phase: 'direct', directOffset: 0, scopeOffset: 0 };
    const loaded = await loadFinancePublicationManifest(id, (key) => work.get(key));
    if (loaded.archived) return { complete: true };
    const manifest = loaded.manifest;
    if (job.phase === 'complete')
      return fail('Finance completed publication still has pending work.');
    const direct = this.directAccounts(manifest),
      scopes = [...manifest.scopes].sort((a, b) => a.PK.localeCompare(b.PK));
    if (
      job.directOffset > direct.length ||
      job.scopeOffset > scopes.length ||
      (job.phase === 'direct' &&
        (job.scopeOffset || job.cursor || job.queueNext || job.queueLast !== undefined))
    )
      return fail('Finance publication checkpoint cursor is invalid.');
    const persist = async (complete = false) => {
      if (!jobSchema.safeParse(job).success)
        return fail('Finance publication checkpoint is invalid.');
      await work.put({
        ...key,
        data: job,
        ...(complete ? { expiresAt: Math.floor(Date.now() / 1000) + retentionSeconds } : {}),
      });
      const fingerprint = createHash('sha256').update(JSON.stringify(job)).digest('hex');
      return work.commit({
        key: { ...key, SK: `PUBLICATION_RECEIPT#${fingerprint}` },
        fingerprint,
        result: { complete },
        expiresAt: Math.floor(Date.now() / 1000) + 86400,
      });
    };
    if (!stored) return persist();
    if (job.queue?.length) {
      const accountId = job.queue[0]!;
      // The child owns and conditions its marker. Its final step changes that row;
      // the parent only conditions its immutable manifest and durable cursor.
      const marker = await this.factory().get({
        PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`,
        SK: 'CURRENT',
      });
      if (!marker || isFinanceAccountRetired(marker, accountId)) {
        const retirement = await new FinanceAccountRetirement({ work: this.factory }).step(
          accountId,
          { creationPublicationId: id },
        );
        if (retirement.handled) {
          if (!retirement.complete) return { complete: false };
        } else {
          if (
            !manifest.changes.some(
              (change) =>
                change.collection === 'accounts' &&
                change.sourceId === accountId &&
                change.beforeVersion === undefined &&
                change.afterVersion === 1,
            )
          )
            return fail('Finance existing account requires a trusted coverage baseline.');
          await initializeFinanceProjectionAccount(accountId, id, this.factory);
          return { complete: false };
        }
      }
      if (!(await this.account.step(accountId)).complete) return { complete: false };
      job.queue.shift();
      if (!job.queue.length) {
        delete job.queue;
        if (job.phase === 'scopes') {
          if (job.queueLast) {
            job.scopeOffset++;
            delete job.cursor;
          } else if (job.queueNext) job.cursor = job.queueNext;
          else return fail('Finance publication directory progress is incomplete.');
          delete job.queueLast;
          delete job.queueNext;
        }
      }
      return persist();
    }
    if (job.queue) return fail('Finance publication checkpoint has an empty pending action.');
    if (job.phase === 'direct') {
      const page = direct.slice(job.directOffset, job.directOffset + 5);
      if (!page.length) job.phase = 'scopes';
      else {
        job.queue = page;
        job.directOffset += page.length;
      }
      return persist();
    }
    const scope = scopes[job.scopeOffset];
    if (scope) {
      const page = await this.impact.accounts(scope.PK, job.cursor);
      if (
        page.accountIds.length > 5 ||
        new Set(page.accountIds).size !== page.accountIds.length ||
        page.accountIds.some((id) => !ulidSchema.safeParse(id).success)
      )
        return fail('Finance publication directory candidate bound failed.');
      if (page.accountIds.length) {
        job.queue = page.accountIds;
        job.queueLast = !page.nextKey;
        if (page.nextKey) job.queueNext = page.nextKey;
      } else if (page.nextKey) job.cursor = page.nextKey;
      else {
        job.scopeOffset++;
        delete job.cursor;
      }
      return persist();
    }
    await this.archive(work, manifest);
    job.phase = 'complete';
    return persist(true);
  }
  private directAccounts(manifest: FinancePublicationManifest) {
    const ids = [...new Set(manifest.changes.flatMap((change) => change.accountIds))].sort();
    if (ids.length > 100 || ids.some((id) => !ulidSchema.safeParse(id).success))
      return fail('Finance publication direct account bound failed.');
    return ids;
  }
  private async archive(work: FinanceUnitOfWork, manifest: FinancePublicationManifest) {
    const key = financePublicationArchiveKey(manifest.id),
      prior = await work.get(key);
    if (prior) return fail('Finance pending publication already has an archive; repair required.');
    const expiresAt = Math.floor(Date.now() / 1000) + retentionSeconds;
    for (const scope of manifest.scopes) {
      const key = {
        PK: scope.PK,
        SK: `PUBLICATION_CHANGE#${String(scope.afterRevision).padStart(16, '0')}`,
      };
      const journal = await work.get(key);
      if (
        journal?.format !== manifest.format ||
        journal.publicationId !== manifest.id ||
        journal.beforeRevision !== scope.beforeRevision ||
        journal.afterRevision !== scope.afterRevision
      )
        return fail('Finance publication archive journal identity conflict.');
      await work.put({ ...journal, expiresAt });
    }
    for (const change of manifest.changes) {
      if (
        !['transactions', 'accounts'].includes(change.collection) ||
        !change.removed ||
        !change.sourceId
      )
        continue;
      const witness = await work.get(
        change.collection === 'accounts'
          ? financePublicationAccountDeletionKey(change.sourceId)
          : financePublicationDeletionKey(change.sourceId),
      );
      // A later delete may already own the pointer; its pending proof must not expire.
      if (witness?.publicationId === manifest.id) {
        if (
          witness.format !==
            (change.collection === 'accounts'
              ? 'finance-publication-account-deletion-v1'
              : 'finance-publication-deletion-v1') ||
          (witness.transactionId ?? witness.accountId) !== change.sourceId
        )
          return fail('Finance publication archive deletion proof identity conflict.');
        await work.put({ ...witness, expiresAt });
      }
    }
    await work.put({
      ...key,
      format: financePublicationArchiveFormat,
      publicationId: manifest.id,
      data: manifest,
      completedAt: new Date().toISOString(),
      expiresAt,
    });
    await work.delete({ PK: manifest.PK, SK: manifest.SK });
  }
}
