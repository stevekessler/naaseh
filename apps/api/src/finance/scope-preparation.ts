import { createHash } from 'node:crypto';
import { createUlid } from '@naaseh/domain';
import { FinanceUnitOfWork, type FinanceRecordKey } from './unit-of-work.js';
import { DynamoFinanceRepository } from './dynamo-repository.js';
import { FinanceRefundIndexVerifier } from './refund-index-coverage-service.js';
import { FinanceExperienceFailure } from './telemetry.js';

type State = {
  operation: string;
  sourceRevision: number;
  phase: 'locators' | 'refund-index';
  cursor?: FinanceRecordKey;
};
/** Explicit scope/catalog bootstrap before account or source locators are available. */
export class FinanceScopePreparation {
  private readonly work: () => FinanceUnitOfWork;
  constructor(
    private readonly options: {
      work?: () => FinanceUnitOfWork;
      locators?: (
        scope: string,
        cursor?: FinanceRecordKey,
      ) => Promise<{ nextCursor: FinanceRecordKey | null; examined: number }>;
      refundIndex?: (
        scope: string,
        options: { restart?: boolean },
      ) => Promise<{ complete: boolean }>;
    } = {},
  ) {
    this.work = options.work ?? (() => new FinanceUnitOfWork());
  }
  async step(PK: string, options: { restart?: boolean } = {}) {
    const catalog = PK === 'FINANCE#CATALOG';
    if (!catalog && !/^FINANCE#SCOPE#(?:OWNER|GROUP)#[^#]+$/u.test(PK))
      throw new Error('Invalid Finance preparation scope.');
    const metaKey = { PK, SK: 'META' };
    const meta = await this.work().get(metaKey);
    if (!meta || !Number.isSafeInteger(meta.revision) || Number(meta.revision) < 0)
      throw new FinanceExperienceFailure(
        'capacity',
        'Finance scope metadata is not ready.',
        'user',
      );
    for (const field of [
      'locatorIndexVersion',
      ...(catalog ? [] : ['refundRelationshipIndexVersion']),
    ]) {
      if (meta[field] !== undefined && meta[field] !== 0 && meta[field] !== 1)
        throw new FinanceExperienceFailure(
          'capacity',
          'Unsupported Finance preparation protocol version.',
          'user',
        );
    }
    if (meta.locatorIndexVersion === 1 && (catalog || meta.refundRelationshipIndexVersion === 1))
      return { phase: 'complete' as const, complete: true };
    const key = { PK, SK: 'SCOPE_BACKFILL_DRIVER' };
    const work = this.work();
    const saved = (await work.get(key))?.data as State | undefined;
    if (
      saved &&
      saved.phase === 'locators' &&
      meta.locatorIndexVersion !== 1 &&
      saved.sourceRevision !== meta.revision &&
      !options.restart
    )
      throw new FinanceExperienceFailure(
        'capacity',
        'Finance preparation revision changed; restart required.',
        'user',
      );
    const state: State =
      saved && !options.restart
        ? structuredClone(saved)
        : { operation: createUlid(), sourceRevision: Number(meta.revision), phase: 'locators' };
    if (!['locators', 'refund-index'].includes(state.phase))
      throw new FinanceExperienceFailure('invariant', 'Finance preparation checkpoint is invalid.');
    if (meta.locatorIndexVersion === 1) {
      state.phase = 'refund-index';
      state.sourceRevision = Number(meta.revision);
      delete state.cursor;
    }
    let complete = false;
    if (state.phase === 'locators') {
      const result = await (this.options.locators ?? DynamoFinanceRepository.backfillLocatorPage)(
        PK,
        state.cursor,
      );
      if (
        !Number.isSafeInteger(result.examined) ||
        result.examined < 0 ||
        result.examined > 40 ||
        (result.nextCursor &&
          (result.nextCursor.PK !== PK ||
            !result.nextCursor.SK.startsWith('ROW#') ||
            (state.cursor && result.nextCursor.SK <= state.cursor.SK)))
      )
        throw new FinanceExperienceFailure('invariant', 'Finance preparation page bound failed.');
      if (result.nextCursor) state.cursor = result.nextCursor;
      else {
        const proof = this.work();
        const current = await proof.get(metaKey);
        if (!current || current.revision !== meta.revision)
          throw new FinanceExperienceFailure(
            'capacity',
            'Finance preparation revision changed; restart required.',
            'user',
          );
        await proof.put({
          ...current,
          locatorIndexVersion: 1,
          revision: Number(current.revision) + 1,
        });
        const fingerprint = createHash('sha256')
          .update(JSON.stringify([PK, current.revision, 'locator-v1']))
          .digest('hex');
        await proof.commit({
          key: { PK, SK: `LOCATOR_COVERAGE_RECEIPT#${fingerprint}` },
          fingerprint,
          result: true,
          expiresAt: Math.floor(Date.now() / 1000) + 86_400,
        });
        state.sourceRevision = Number(current.revision) + 1;
        delete state.cursor;
        state.phase = 'refund-index';
        complete = catalog;
      }
    } else {
      const result = await (
        this.options.refundIndex ??
        ((scope, opts) => new FinanceRefundIndexVerifier({ work: this.work }).step(scope, opts))
      )(PK, { restart: options.restart === true });
      complete = result.complete;
    }
    await work.put({ ...key, data: state });
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([state, complete]))
      .digest('hex');
    return work.commit({
      key: { PK, SK: `SCOPE_DRIVER_RECEIPT#${fingerprint}` },
      fingerprint,
      result: { phase: complete ? ('complete' as const) : state.phase, complete },
      expiresAt: Math.floor(Date.now() / 1000) + 86_400,
    });
  }
}
