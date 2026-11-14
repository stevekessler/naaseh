import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ulidSchema } from '@naaseh/domain';
import { FinanceUnitOfWork, loadTargetedFinanceEntity } from './unit-of-work.js';
import {
  loadFinanceDeletedAccount,
  financeCanonicalAbsenceKeys,
} from './publication-deletion-proof.js';
import { loadFinancePublicationManifest } from './publication-journal-reader.js';
import { SpendProjectionService } from './spend-projection-service.js';
import { validFinanceCoverageCounts } from './coverage-application.js';
import { financeScopeRevisionVectorSchema } from './publication-window.js';
import { FinanceExperienceFailure } from './telemetry.js';
import {
  financeAccountRetirementCertificate,
  isFinanceAccountRetired,
} from './account-retirement-marker.js';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { assertCurrentFinanceAccountBirth } from './account-birth-proof.js';
export { isFinanceAccountRetired } from './account-retirement-marker.js';
const fail = (message: string): never => {
  throw new FinanceExperienceFailure('invariant', message);
};
/** Retire projections only after proven canonical removal; never deletes canonical records. */
export class FinanceAccountRetirement {
  private readonly factory: () => FinanceUnitOfWork;
  private readonly publisher: SpendProjectionService;
  constructor(
    private readonly options: {
      work?: () => FinanceUnitOfWork;
      accountPage?: (id: string) => Promise<{ rows: Record<string, unknown>[] }>;
    } = {},
  ) {
    this.factory = options.work ?? (() => new FinanceUnitOfWork());
    this.publisher = new SpendProjectionService(this.factory);
  }
  async step(
    accountId: string,
    options: { creationPublicationId?: string } = {},
  ): Promise<{ handled: boolean; complete: boolean }> {
    if (!ulidSchema.safeParse(accountId).success)
      return fail('Finance account retirement identity is invalid.');
    const work = this.factory();
    if (await loadTargetedFinanceEntity(work, 'accounts', accountId))
      return { handled: false, complete: false };
    const key = { PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`, SK: 'CURRENT' },
      marker = await work.get(key);
    if (isFinanceAccountRetired(marker, accountId)) {
      for (const key of financeCanonicalAbsenceKeys('accounts', accountId, String(marker!.scopePK)))
        if (await work.get(key)) return { handled: false, complete: false };
      return { handled: true, complete: true };
    }
    const proof = await loadFinanceDeletedAccount(accountId, work);
    if (!proof || !proof.accountIds.includes(accountId))
      return fail('Finance account retirement deletion proof is unavailable.');
    const cardinality = await work.get({
      PK: `FINANCE#FACT_ACCOUNT#${accountId}`,
      SK: 'CARDINALITY',
    });
    const indexCount = Number(cardinality?.facts ?? 0);
    if (!Number.isSafeInteger(indexCount) || indexCount < 0)
      return fail('Finance account retirement index count is invalid.');
    if (!marker) {
      if (!options.creationPublicationId || indexCount !== 0)
        return fail(
          'Finance retirement requires a trusted baseline or pending genuine birth proof.',
        );
      const { manifest } = await loadFinancePublicationManifest(
        options.creationPublicationId,
        (k) => work.get(k),
      );
      const creation = manifest.changes.find(
        (c) =>
          c.collection === 'accounts' &&
          c.sourceId === accountId &&
          !c.removed &&
          c.beforeVersion === undefined &&
          c.afterVersion === 1,
      );
      const transition = manifest.scopes.find((s) => s.PK === creation?.scopePK);
      if (
        !creation ||
        !transition ||
        manifest.changes.some(
          (c) => c.collection === 'accounts' && c.sourceId === accountId && c.removed,
        ) ||
        (transition.PK === proof.scopePK && transition.afterRevision >= proof.revision)
      )
        return fail('Finance retirement birth proof is invalid.');
      const journal = await work.get({
        PK: transition.PK,
        SK: `PUBLICATION_CHANGE#${String(transition.afterRevision).padStart(16, '0')}`,
      });
      await assertCurrentFinanceAccountBirth(work, accountId, manifest.id, transition.PK);
      if (
        journal?.format !== manifest.format ||
        journal.publicationId !== manifest.id ||
        journal.beforeRevision !== transition.beforeRevision ||
        journal.afterRevision !== transition.afterRevision
      )
        return fail('Finance retirement creation journal is invalid.');
    } else {
      const count = Number(marker.coverageSourceCount);
      if (
        !['ready', 'awaiting-coverage', 'rebuilding'].includes(String(marker.state)) ||
        marker.incrementalCoverageVersion !== 1 ||
        typeof marker.coverageGeneration !== 'string' ||
        !/^[a-f0-9]{64}$/.test(marker.coverageGeneration) ||
        !Number.isSafeInteger(marker.revision) ||
        !Number.isSafeInteger(count) ||
        count < 0 ||
        count > 1_000_000 ||
        !validFinanceCoverageCounts(marker.coverageDependencyUseCounts, 'scope', count) ||
        !validFinanceCoverageCounts(marker.coverageOriginalSourceUseCounts, 'account', count) ||
        !financeScopeRevisionVectorSchema.safeParse(marker.coverageDependencies).success
      )
        return fail('Finance retirement requires a trusted coverage baseline.');
      if (marker.state === 'rebuilding') {
        if (
          !ulidSchema.safeParse(marker.transactionId).success ||
          !(await this.publisher.resumePendingStep(String(marker.transactionId))).pending
        )
          return fail('Finance retirement pending source cannot be resumed.');
        return { handled: true, complete: false };
      }
      if (indexCount > 0) {
        const PK = `FINANCE#FACT_ACCOUNT#${accountId}`;
        const page = this.options.accountPage
          ? await this.options.accountPage(accountId)
          : {
              rows:
                (
                  await dynamodb.send(
                    new QueryCommand({
                      TableName: tableName,
                      ConsistentRead: true,
                      Limit: 5,
                      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
                      ExpressionAttributeValues: { ':pk': PK, ':prefix': 'DATE#' },
                    }),
                  )
                ).Items ?? [],
            };
        if (!page.rows.length || page.rows.length > 5 || page.rows.length > indexCount)
          return fail('Finance retirement account page/count is incomplete.');
        let prior = '';
        for (const row of page.rows) {
          if (
            row.PK !== PK ||
            typeof row.SK !== 'string' ||
            !row.SK.startsWith('DATE#') ||
            row.SK <= prior ||
            !ulidSchema.safeParse(row.transactionId).success
          )
            return fail('Finance retirement account page identity is invalid.');
          prior = row.SK;
        }
        await this.publisher.removeStep(String(page.rows[0]!.transactionId), accountId);
        return { handled: true, complete: false };
      }
      if (count !== 0 || Number(marker.coverageDeferredSourceCount ?? 0) !== 0)
        return fail('Finance account retirement has unresolved source coverage.');
    }
    const retired = {
      ...key,
      format: 'finance-account-retirement-v1' as const,
      state: 'retired' as const,
      accountId,
      deletionPublicationId: proof.publicationId,
      scopePK: proof.scopePK,
      scopeRevision: proof.revision,
      coverageSourceCount: 0 as const,
      revision: Number(marker?.revision ?? 0) + 1,
    };
    const certificate = financeAccountRetirementCertificate(retired);
    if (!isFinanceAccountRetired({ ...retired, certificate }, accountId))
      return fail('Finance account retirement certificate exceeds its valid format.');
    await work.put({ ...retired, certificate });
    return work.commit({
      key: { ...key, SK: `RETIREMENT_RECEIPT#${certificate}` },
      fingerprint: certificate,
      result: { handled: true, complete: true },
      expiresAt: Math.floor(Date.now() / 1000) + 86400,
    });
  }
}
