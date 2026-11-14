import { createHash } from 'node:crypto';
import { createUlid, ulidSchema } from '@naaseh/domain';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import {
  FinanceUnitOfWork,
  loadTargetedFinanceEntity,
  type FinanceRecordKey,
} from './unit-of-work.js';
import { loadCanonicalFinanceFact } from './canonical-spend-source.js';
import {
  FinancePublicationJournalReader,
  type FinancePublicationManifest,
} from './publication-journal-reader.js';
import { FinancePublicationImpactReader } from './publication-impact-reader.js';
import { SpendProjectionService } from './spend-projection-service.js';
import { FinanceIncrementalCoverageService } from './incremental-coverage-service.js';
import {
  validFinanceCoverageCounts,
  validFinanceCoverageApplication,
} from './coverage-application.js';
import { assertFinanceSourceCreation } from './publication-creation-proof.js';
import { financePublicationFingerprint } from './source-dependency-index.js';
import {
  projectionDependencyKey,
  projectionDependencyFormat,
} from './projection-dependency-directory.js';
import { FinanceExperienceFailure } from './telemetry.js';
import type { FinanceFact } from './query-contract.js';
import { loadFinanceDeletedTransaction } from './publication-deletion-proof.js';
import { FinanceAccountRetirement } from './account-retirement.js';
import { FinancePublicationAccountMissing } from './account-retirement-marker.js';

import {
  financeScopeRevisionVectorSchema as vector,
  financeAccountPublicationWindowSchema as windowSchema,
  type FinanceAccountPublicationWindow as Window,
} from './publication-window.js';
import { financeAccountRelocations } from './publication-relocation.js';
type Mode = {
  kind: 'direct' | 'account' | 'merchant' | 'budgetItem' | 'originalExpense' | 'originalAccount';
  id: string;
};
const metadataCollections = new Set([
  'balanceSnapshots',
  'transfers',
  'categories',
  'budgets',
  'budgetAccountLinks',
  'budgetReconciliations',
  'financialTaskLinks',
  'reusableItems',
  'reusableOccurrenceLocks',
  'transactionMatches',
  'reviewIssues',
  'transactionAliases',
  'keptSeparatePairs',
  'categoryNameLocks',
  'merchantKeyLocks',
  'catalogReferenceCounts',
  'csvBatches',
  'csvFileReceipts',
  'csvRowReceipts',
  'sourceIdentities',
  'connections',
  'importJobs',
  'pendingSimplefinAccounts',
  'deletionPreviews',
]);
const fail = (message: string): never => {
  throw new FinanceExperienceFailure('invariant', message);
};

/** One bounded durable action per call. Private only; no dispatch or bootstrap enumeration. */
export class FinanceAccountPublicationConsumer {
  private readonly factory: () => FinanceUnitOfWork;
  private readonly resolve: typeof loadCanonicalFinanceFact;
  private readonly publisher: SpendProjectionService;
  private readonly applications: FinanceIncrementalCoverageService;
  private readonly journal: Pick<FinancePublicationJournalReader, 'range'>;
  private readonly impact: Pick<FinancePublicationImpactReader, 'sources'>;
  constructor(
    private readonly options: {
      work?: () => FinanceUnitOfWork;
      resolve?: typeof loadCanonicalFinanceFact;
      publish?: (fact: FinanceFact) => Promise<void>;
      journal?: Pick<FinancePublicationJournalReader, 'range'>;
      impact?: Pick<FinancePublicationImpactReader, 'sources'>;
      accountPage?: (
        id: string,
        cursor?: FinanceRecordKey,
      ) => Promise<{
        rows: Record<string, unknown>[];
        nextKey?: FinanceRecordKey;
      }>;
      deferredPage?: (accountId: string) => Promise<Record<string, unknown>[]>;
    } = {},
  ) {
    this.factory = options.work ?? (() => new FinanceUnitOfWork());
    this.resolve = options.resolve ?? loadCanonicalFinanceFact;
    this.publisher = new SpendProjectionService(this.factory);
    this.applications = new FinanceIncrementalCoverageService({
      work: this.factory,
      resolve: this.resolve,
    });
    this.journal = options.journal ?? new FinancePublicationJournalReader();
    this.impact = options.impact ?? new FinancePublicationImpactReader();
  }
  private async load(accountId: string) {
    if (!ulidSchema.safeParse(accountId).success)
      return fail('Finance publication account identity is invalid.');
    const work = this.factory();
    const account = await loadTargetedFinanceEntity<{ id: string; version?: number }>(
      work,
      'accounts',
      accountId,
    );
    const markerKey = { PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`, SK: 'CURRENT' };
    const jobKey = { ...markerKey, SK: 'PUBLICATION_WINDOW' };
    const marker = await work.get(markerKey),
      stored = await work.get(jobKey);
    if (!account)
      throw new FinancePublicationAccountMissing(
        'Finance canonical publication account is unavailable.',
      );
    const count = Number(marker?.coverageSourceCount);
    if (
      !account ||
      account.value.id !== accountId ||
      !marker ||
      marker.incrementalCoverageVersion !== 1 ||
      typeof marker.coverageGeneration !== 'string' ||
      !/^[a-f0-9]{64}$/.test(marker.coverageGeneration) ||
      !['ready', 'awaiting-coverage', 'rebuilding'].includes(String(marker.state)) ||
      !Number.isSafeInteger(marker.revision) ||
      Number(marker.revision) < 0 ||
      !Number.isSafeInteger(count) ||
      count < 0 ||
      count > 1_000_000 ||
      !Number.isSafeInteger(marker.coverageDeferredSourceCount ?? 0) ||
      Number(marker.coverageDeferredSourceCount ?? 0) < 0 ||
      Number(marker.coverageDeferredSourceCount ?? 0) > 1_000_000 ||
      !validFinanceCoverageCounts(marker.coverageDependencyUseCounts, 'scope', count) ||
      !validFinanceCoverageCounts(marker.coverageOriginalSourceUseCounts, 'account', count) ||
      !vector.safeParse(marker.coverageDependencies).success
    )
      return fail('Finance account publication requires a trusted coverage baseline.');
    let window: Window | undefined;
    if (stored) {
      const parsed = windowSchema.safeParse(stored.data);
      if (!parsed.success) return fail('Finance publication window checkpoint format is invalid.');
      window = parsed.data;
      if (
        Object.entries(window.relocationProbes ?? {}).some(
          ([PK, revision]) =>
            window!.baseline[PK] === undefined ||
            revision < window!.baseline[PK]! ||
            revision > window!.target[PK]!,
        ) ||
        new Set((window.relocations ?? []).map((entry) => entry.publicationId)).size !==
          (window.relocations?.length ?? 0) ||
        window.relocations?.some(
          (entry) =>
            entry.afterVersion !== entry.beforeVersion + 1 ||
            window!.baseline[entry.from] === undefined ||
            window!.baseline[entry.to] === undefined ||
            entry.fromAfterRevision <= window!.baseline[entry.from]! ||
            entry.fromAfterRevision > window!.target[entry.from]! ||
            entry.toBeforeRevision < window!.baseline[entry.to]! ||
            entry.toAfterRevision > window!.target[entry.to]!,
        )
      )
        return fail('Finance relocation checkpoint causal revisions are invalid.');
      for (const [PK, before] of Object.entries(window.baseline))
        if (
          window.target[PK] === undefined ||
          window.target[PK]! < before ||
          window.progress[PK] === undefined ||
          window.progress[PK]! < before ||
          window.progress[PK]! > window.target[PK]!
        )
          return fail('Finance publication window revision checkpoint is invalid.');
      if (
        Object.keys(window.progress).some((PK) => window!.baseline[PK] === undefined) ||
        (window.current &&
          (window.current.revision !== window.progress[window.current.scopePK]! + 1 ||
            window.current.revision > window.target[window.current.scopePK]!)) ||
        (window.phase !== 'journals' && window.current)
      )
        return fail('Finance publication window cursor checkpoint is invalid.');
    }
    return { work, account, marker, markerKey, jobKey, window };
  }
  private async targets(work: FinanceUnitOfWork, target: Record<string, number>) {
    for (const [PK, revision] of Object.entries(target))
      if ((await work.get({ PK, SK: 'META' }))?.revision !== revision) return false;
    return true;
  }
  private async persist(
    context: Awaited<ReturnType<FinanceAccountPublicationConsumer['load']>>,
    window: Window,
    complete = false,
  ) {
    if (
      !windowSchema.safeParse(window).success ||
      Buffer.byteLength(JSON.stringify(window)) > 150_000
    )
      return fail('Finance publication window checkpoint exceeds its safe budget.');
    if (!(await this.targets(context.work, window.target)))
      throw new FinanceExperienceFailure(
        'capacity',
        'Finance publication target changed; retry the window.',
        'automatic',
      );
    await context.work.put({ ...context.jobKey, data: window });
    const fingerprint = createHash('sha256').update(JSON.stringify(window)).digest('hex');
    return context.work.commit({
      key: { ...context.jobKey, SK: `PUBLICATION_WINDOW_RECEIPT#${fingerprint}` },
      fingerprint,
      result: { complete },
      expiresAt: Math.floor(Date.now() / 1000) + 86400,
    });
  }
  private async start(context: Awaited<ReturnType<FinanceAccountPublicationConsumer['load']>>) {
    if (context.marker.state === 'rebuilding')
      return fail('Finance publication must resume its pending source first.');
    const baseline = vector.parse(context.marker.coverageDependencies);
    const target: Record<string, number> = {};
    const scopes = new Set([
      ...Object.keys(baseline),
      ...Object.keys(context.marker.coverageDependencyUseCounts as object),
      context.account.scopeKey.PK,
    ]);
    if (scopes.size > 80) return fail('Finance publication dependency budget exceeded.');
    for (const PK of [...scopes].sort()) {
      const revision = (await context.work.get({ PK, SK: 'META' }))?.revision;
      if (
        typeof revision !== 'number' ||
        !Number.isSafeInteger(revision) ||
        revision < (baseline[PK] ?? 0)
      )
        return fail('Finance publication source revision is unavailable.');
      target[PK] = revision;
    }
    const window: Window = {
      version: 1,
      id: createUlid(),
      generation: context.marker.coverageGeneration as string,
      baseline,
      target,
      progress: { ...baseline },
      phase: baseline[context.account.scopeKey.PK] === undefined ? 'relocation' : 'journals',
      relocations: [],
      relocationProbes: {},
      registryOffset: 0,
    };
    await context.work.put({
      ...context.marker,
      state: 'awaiting-coverage',
      coverageVerified: false,
      coverageWindowId: window.id,
      revision: Number(context.marker.revision) + 1,
    });
    return this.persist(context, window);
  }
  async step(accountId: string): Promise<{ complete: boolean }> {
    let context: Awaited<ReturnType<FinanceAccountPublicationConsumer['load']>>;
    try {
      context = await this.load(accountId);
    } catch (error) {
      if (!(error instanceof FinancePublicationAccountMissing)) throw error;
      const retired = await new FinanceAccountRetirement({
        work: this.factory,
        ...(this.options.accountPage ? { accountPage: (id) => this.options.accountPage!(id) } : {}),
      }).step(accountId);
      return { complete: retired.complete };
    }
    const { window, marker } = context;
    const valid =
      window &&
      window.generation === marker.coverageGeneration &&
      (window.phase === 'complete'
        ? marker.state === 'ready' && marker.coverageVerified === true
        : marker.coverageWindowId === window.id);
    if (!valid || !(await this.targets(context.work, window.target))) {
      if (marker.state === 'rebuilding') {
        if (
          !window?.current?.queue?.includes(String(marker.transactionId)) ||
          !(await this.publisher.resumePendingStep(String(marker.transactionId))).pending
        )
          return fail('Finance publication pending source cannot be resumed.');
        return { complete: false };
      }
      return this.start(context);
    }
    if (window.phase === 'complete') return { complete: true };
    if (window.phase === 'relocation') return this.relocate(context, window);
    if (window.phase === 'deferred') return this.verifyDeferred(context, window);
    if (window.phase === 'enrollment') return this.enroll(context, window);
    if (!window.current) {
      const PK = Object.keys(window.baseline)
        .sort()
        .find((PK) => window.progress[PK]! < window.target[PK]!);
      if (!PK) {
        window.phase =
          Number(marker.coverageDeferredSourceCount ?? 0) > 0 ? 'deferred' : 'enrollment';
        return this.persist(context, window);
      }
      const page = await this.journal.range(PK, window.progress[PK]!, window.target[PK]!);
      if (!page.entries.length) return fail('Finance publication journal window is incomplete.');
      const relevant = page.entries.find((manifest) =>
        manifest.changes.some((change) => this.modes(change, accountId, marker).length),
      );
      if (!relevant) {
        window.progress[PK] = page.nextRevision ?? window.target[PK]!;
        return this.persist(context, window);
      }
      if (await this.adoptRelocations(context, window, relevant))
        return this.persist(context, window);
      const transition = relevant.scopes.find((scope) => scope.PK === PK);
      if (!transition) return fail('Finance publication journal transition is missing.');
      window.progress[PK] = transition.beforeRevision;
      window.current = {
        scopePK: PK,
        revision: transition.afterRevision,
        publicationId: relevant.id,
        changeIndex: 0,
        modeIndex: 0,
      };
      return this.persist(context, window);
    }
    const current = window.current;
    const page = await this.journal.range(current.scopePK, current.revision - 1, current.revision);
    const manifest = page.entries[0];
    if (page.entries.length !== 1 || manifest?.id !== current.publicationId)
      return fail('Finance publication journal checkpoint identity changed.');
    if (await this.adoptRelocations(context, window, manifest))
      return this.persist(context, window);
    if (current.queue !== undefined) {
      if (current.queue.length) return this.source(context, window, manifest, current.queue[0]!);
      if (current.queueLast) {
        current.modeIndex++;
        delete current.cursor;
      } else if (current.queueNext) current.cursor = current.queueNext;
      else return fail('Finance publication impact cursor is incomplete.');
      delete current.queue;
      delete current.queueLast;
      delete current.queueNext;
      return this.persist(context, window);
    }
    const change = manifest.changes[current.changeIndex];
    if (!change) {
      window.progress[current.scopePK] = current.revision;
      delete window.current;
      return this.persist(context, window);
    }
    const modes = this.modes(change, accountId, marker);
    const mode = modes[current.modeIndex];
    if (!mode) {
      current.changeIndex++;
      current.modeIndex = 0;
      delete current.cursor;
      return this.persist(context, window);
    }
    let ids: string[], nextKey: FinanceRecordKey | undefined;
    if (mode.kind === 'direct') ids = [mode.id];
    else if (mode.kind === 'account') {
      if (mode.id !== accountId) ids = [];
      else {
        const page = await this.accountPage(accountId, current.cursor);
        ids = page.rows.map((row) => String(row.transactionId));
        nextKey = page.nextKey;
      }
    } else {
      const page = await this.impact.sources(mode.kind, mode.id, current.cursor, accountId);
      ids = page.sources
        .filter((source) => source.accountId === accountId)
        .map((source) => source.transactionId);
      nextKey = page.nextKey;
    }
    current.queue = [...new Set(ids)];
    current.queueLast = !nextKey;
    if (nextKey) current.queueNext = nextKey;
    return this.persist(context, window);
  }
  private async adoptRelocations(
    context: Awaited<ReturnType<FinanceAccountPublicationConsumer['load']>>,
    window: Window,
    manifest: FinancePublicationManifest,
  ) {
    let changed = false;
    for (const relocation of financeAccountRelocations(manifest, context.account.value.id)) {
      if (
        window.baseline[relocation.from] === undefined ||
        relocation.fromAfterRevision <= window.baseline[relocation.from]!
      )
        continue;
      if (
        relocation.afterVersion > Number(context.account.value.version) ||
        !Number.isSafeInteger(context.account.value.version) ||
        relocation.fromAfterRevision > window.target[relocation.from]!
      )
        return fail('Finance relocation exceeds its pinned account version or source revision.');
      if (window.relocations?.some((entry) => entry.publicationId === relocation.publicationId))
        continue;
      const current = (await context.work.get({ PK: relocation.to, SK: 'META' }))?.revision;
      if (
        !Number.isSafeInteger(current) ||
        Number(current) < relocation.toAfterRevision ||
        (window.target[relocation.to] !== undefined && window.target[relocation.to] !== current)
      )
        return fail('Finance relocation target revision is unavailable.');
      window.target[relocation.to] = Number(current);
      if (window.baseline[relocation.to] === undefined) {
        window.baseline[relocation.to] = relocation.toBeforeRevision;
        window.progress[relocation.to] = relocation.toBeforeRevision;
      }
      (window.relocations ??= []).push(relocation);
      changed = true;
    }
    if (changed && !window.current) window.phase = 'relocation';
    return changed;
  }
  private async relocate(
    context: Awaited<ReturnType<FinanceAccountPublicationConsumer['load']>>,
    window: Window,
  ) {
    const probes = (window.relocationProbes ??= {});
    const PK = Object.keys(window.baseline)
      .sort()
      .find((PK) => (probes[PK] ?? window.baseline[PK]!) < window.target[PK]!);
    if (!PK) {
      if (window.baseline[context.account.scopeKey.PK] === undefined)
        return fail('Finance relocation is missing an atomic move from its verified baseline.');
      window.phase = 'journals';
      return this.persist(context, window);
    }
    const after = probes[PK] ?? window.baseline[PK]!;
    const page = await this.journal.range(PK, after, window.target[PK]!);
    if (!page.entries.length) return fail('Finance relocation journal window is incomplete.');
    for (const manifest of page.entries) await this.adoptRelocations(context, window, manifest);
    probes[PK] = page.nextRevision ?? window.target[PK]!;
    return this.persist(context, window);
  }
  private modes(
    change: FinancePublicationManifest['changes'][number],
    accountId: string,
    marker: Record<string, unknown>,
  ): Mode[] {
    const id = change.sourceId;
    if (metadataCollections.has(change.collection)) return [];
    if (!id || !ulidSchema.safeParse(id).success)
      return fail('Finance publication source identity is unsupported.');
    switch (change.collection) {
      case 'transactions': {
        if (!change.accountIds.length)
          return fail('Finance transaction journal account identity is missing.');
        const modes: Mode[] = [];
        if (change.accountIds.includes(accountId)) modes.push({ kind: 'direct', id });
        const originals = marker.coverageOriginalSourceUseCounts as Record<string, number>;
        if (change.accountIds.some((id) => (originals[id] ?? 0) > 0))
          modes.push({ kind: 'originalExpense', id });
        return modes;
      }
      case 'refundRelationships':
        return [{ kind: 'direct', id }];
      case 'merchants':
        return [{ kind: 'merchant', id }];
      case 'budgetItems':
        return [{ kind: 'budgetItem', id }];
      case 'accounts': {
        const modes: Mode[] = [];
        if (id === accountId) modes.push({ kind: 'account', id });
        if (((marker.coverageOriginalSourceUseCounts as Record<string, number>)[id] ?? 0) > 0)
          modes.push({ kind: 'originalAccount', id });
        return modes;
      }
      default:
        return fail('Finance publication collection requires an upgraded consumer.');
    }
  }
  private async source(
    context: Awaited<ReturnType<FinanceAccountPublicationConsumer['load']>>,
    window: Window,
    manifest: FinancePublicationManifest,
    transactionId: string,
  ) {
    const creation = manifest.changes.some(
      (change) =>
        change.collection === 'transactions' &&
        change.sourceId === transactionId &&
        change.beforeVersion === undefined &&
        change.afterVersion !== undefined &&
        !change.removed &&
        !manifest.changes.some(
          (other) =>
            other.collection === 'transactions' &&
            other.sourceId === transactionId &&
            other.removed,
        ),
    );
    if (!creation && window.relocations?.length) {
      const publication = (
        await this.factory().get({
          PK: `FINANCE#TRANSACTION#${transactionId}`,
          SK: 'SPEND_CONTRIBUTION',
        })
      )?.data as { state?: string; coverageApplication?: unknown } | undefined;
      if (publication?.coverageApplication === undefined) {
        if (publication?.state === 'rebuilding') {
          await this.publisher.resumePendingStep(transactionId);
          return { complete: false };
        }
        return this.advanceSource(context, window, transactionId, true);
      }
    }
    const deletion = await loadFinanceDeletedTransaction(transactionId, this.factory());
    if (deletion) {
      if (
        deletion.accountIds.includes(context.account.value.id) &&
        !(await this.publisher.removeStep(
          transactionId,
          context.account.value.id,
          creation ? manifest.id : undefined,
        ))
      )
        return { complete: false };
      return this.advanceSource(context, window, transactionId);
    }
    const canonical = await this.resolve(transactionId, this.factory);
    if (canonical.fact.accountId !== context.account.value.id) {
      const old = await context.work.get({ PK: `FINANCE#FACT#${transactionId}`, SK: 'CURRENT' });
      if ((old?.fact as FinanceFact | undefined)?.accountId === context.account.value.id)
        return fail('Finance transaction account move requires trusted coverage repair.');
    } else {
      let added = false;
      for (const [PK, revision] of Object.entries(canonical.dependencies)) {
        if (window.target[PK] !== undefined && window.target[PK] !== revision)
          return this.start(context);
        if (window.target[PK] === undefined) {
          window.target[PK] = revision;
          added = true;
        }
      }
      if (added) return this.persist(context, window);
      const publication = (
        await this.factory().get({
          PK: `FINANCE#TRANSACTION#${transactionId}`,
          SK: 'SPEND_CONTRIBUTION',
        })
      )?.data as { state?: string; deletion?: unknown; coverageApplication?: unknown } | undefined;
      // A later creation journal, still inside the pinned window, owns reenrollment.
      if (publication?.state === 'complete' && publication.deletion && !creation)
        return this.advanceSource(context, window, transactionId);
      if (this.options.publish) await this.options.publish(canonical.fact);
      else {
        const resumed = await this.publisher.resumePendingStep(transactionId);
        if (resumed.pending) return { complete: false };
        if (
          !(await this.publisher.publishStep(
            canonical.fact,
            'UTC',
            creation ? { creationPublicationId: manifest.id } : {},
          ))
        )
          return { complete: false };
      }
      await this.applications.applyPublishedSource(
        transactionId,
        creation ? { creationPublicationId: manifest.id } : {},
      );
    }
    return this.advanceSource(context, window, transactionId);
  }
  private async advanceSource(
    context: Awaited<ReturnType<FinanceAccountPublicationConsumer['load']>>,
    window: Window,
    transactionId: string,
    deferred = false,
  ) {
    // Publication spans multiple transactions. Re-read the durable action before advancing it.
    const fresh = await this.load(context.account.value.id);
    if (fresh.window?.id !== window.id || fresh.window.current?.queue?.[0] !== transactionId)
      return { complete: false };
    if (!(await this.targets(fresh.work, fresh.window.target))) return this.start(fresh);
    if (deferred) {
      const key = { PK: fresh.markerKey.PK, SK: `PUBLICATION_DEFERRED#${transactionId}` };
      const saved = await fresh.work.get(key);
      if (
        saved &&
        (saved.format !== 'finance-publication-deferred-v1' ||
          saved.transactionId !== transactionId)
      )
        return fail('Finance deferred source identity conflict.');
      if (!saved) {
        const count = Number(fresh.marker.coverageDeferredSourceCount ?? 0) + 1;
        if (count > 1_000_000) return fail('Finance deferred source count budget exceeded.');
        await fresh.work.put({
          ...key,
          format: 'finance-publication-deferred-v1',
          transactionId,
          generation: fresh.marker.coverageGeneration,
        });
        await fresh.work.put({
          ...fresh.marker,
          coverageDeferredSourceCount: count,
          revision: Number(fresh.marker.revision) + 1,
        });
      } else if (saved.generation !== fresh.marker.coverageGeneration) {
        await fresh.work.put({ ...saved, generation: fresh.marker.coverageGeneration });
      }
    }
    fresh.window.current.queue.shift();
    return this.persist(fresh, fresh.window);
  }
  private async accountPage(accountId: string, cursor?: FinanceRecordKey) {
    const PK = `FINANCE#FACT_ACCOUNT#${accountId}`;
    if (cursor && (cursor.PK !== PK || !cursor.SK.startsWith('DATE#')))
      return fail('Finance publication account cursor is invalid.');
    const page = this.options.accountPage
      ? await this.options.accountPage(accountId, cursor)
      : await (async () => {
          const result = await dynamodb.send(
            new QueryCommand({
              TableName: tableName,
              ConsistentRead: true,
              Limit: 5,
              KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
              ExpressionAttributeValues: { ':pk': PK, ':prefix': 'DATE#' },
              ...(cursor ? { ExclusiveStartKey: cursor } : {}),
            }),
          );
          return {
            rows: result.Items ?? [],
            ...(result.LastEvaluatedKey
              ? { nextKey: result.LastEvaluatedKey as FinanceRecordKey }
              : {}),
          };
        })();
    let prior = cursor?.SK;
    if (page.rows.length > 5) return fail('Finance publication account page exceeds its bound.');
    for (const row of page.rows) {
      if (
        row.PK !== PK ||
        typeof row.SK !== 'string' ||
        !row.SK.startsWith('DATE#') ||
        !ulidSchema.safeParse(row.transactionId).success ||
        (prior && row.SK <= prior)
      )
        return fail('Finance publication account index identity is invalid.');
      prior = row.SK;
    }
    if (page.nextKey && (page.nextKey.PK !== PK || !page.rows.length || page.nextKey.SK !== prior))
      return fail('Finance publication account page progress is invalid.');
    return page;
  }
  private async verifyDeferred(
    context: Awaited<ReturnType<FinanceAccountPublicationConsumer['load']>>,
    window: Window,
  ) {
    const count = Number(context.marker.coverageDeferredSourceCount ?? 0);
    if (count === 0) {
      window.phase = 'enrollment';
      return this.persist(context, window);
    }
    const PK = context.markerKey.PK,
      prefix = 'PUBLICATION_DEFERRED#';
    const rows = this.options.deferredPage
      ? await this.options.deferredPage(context.account.value.id)
      : ((
          await dynamodb.send(
            new QueryCommand({
              TableName: tableName,
              ConsistentRead: true,
              Limit: 5,
              KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
              ExpressionAttributeValues: { ':pk': PK, ':prefix': prefix },
            }),
          )
        ).Items ?? []);
    if (!rows.length || rows.length > 5 || rows.length > count)
      return fail('Finance deferred source page/count is incomplete.');
    let prior = '';
    for (const row of rows) {
      const id = String(row.transactionId);
      if (
        row.PK !== PK ||
        row.SK !== `${prefix}${id}` ||
        !ulidSchema.safeParse(id).success ||
        String(row.SK) <= prior
      )
        return fail('Finance deferred source page identity is invalid.');
      prior = String(row.SK);
      const key = { PK, SK: String(row.SK) },
        stored = await context.work.get(key);
      if (
        stored?.format !== 'finance-publication-deferred-v1' ||
        stored.transactionId !== id ||
        typeof stored.generation !== 'string' ||
        !/^[a-f0-9]{64}$/.test(stored.generation)
      )
        return fail('Finance deferred source checkpoint identity changed.');
      // Explicit canonical verification supersedes claims from an older baseline.
      if (stored.generation !== context.marker.coverageGeneration) {
        await context.work.delete(key);
        continue;
      }
      const publication = (
        await context.work.get({ PK: `FINANCE#TRANSACTION#${id}`, SK: 'SPEND_CONTRIBUTION' })
      )?.data as
        | {
            state?: string;
            fingerprint?: string;
            calendarBasis?: string;
            coverageApplication?: unknown;
            deletion?: { publicationId?: string; unappliedCreationPublicationId?: string };
          }
        | undefined;
      const projected = (await context.work.get({ PK: `FINANCE#FACT#${id}`, SK: 'CURRENT' }))
        ?.fact as FinanceFact | undefined;
      const applied = publication?.coverageApplication;
      if (
        projected &&
        publication?.state === 'complete' &&
        validFinanceCoverageApplication(applied) &&
        applied.generation === context.marker.coverageGeneration &&
        applied.fingerprint === publication.fingerprint &&
        projected.accountId === context.account.value.id
      ) {
        const canonical = await this.resolve(id, this.factory);
        if (
          publication.fingerprint !==
            financePublicationFingerprint(canonical.fact, publication.calendarBasis ?? 'UTC') ||
          applied.dependencyScopes.join('|') !==
            Object.keys(canonical.dependencies).sort().join('|')
        )
          return fail('Finance deferred source coverage is not current.');
        for (const [PK, revision] of Object.entries(canonical.dependencies))
          if (
            revision !== window.target[PK] ||
            (await context.work.get({ PK, SK: 'META' }))?.revision !== revision
          )
            return fail('Finance deferred source revision changed.');
      } else if (
        !projected &&
        publication?.state === 'complete' &&
        publication.deletion?.unappliedCreationPublicationId
      ) {
        const proof = await loadFinanceDeletedTransaction(id, context.work);
        if (
          !proof ||
          proof.publicationId !== publication.deletion.publicationId ||
          !proof.accountIds.includes(context.account.value.id)
        )
          return fail('Finance deferred deleted source proof is unavailable.');
        await assertFinanceSourceCreation(context.work, {
          publicationId: publication.deletion.unappliedCreationPublicationId,
          transactionId: id,
          accountId: context.account.value.id,
          scopePK: context.account.scopeKey.PK,
          sourceVersion: proof.beforeVersion,
          marker: context.marker,
          deletedAt: { PK: proof.scopePK, revision: proof.revision },
        });
      } else return fail('Finance deferred source lacks complete creation or deletion coverage.');
      await context.work.delete(key);
    }
    const remaining = count - rows.length;
    await context.work.put({
      ...context.marker,
      coverageDeferredSourceCount: remaining,
      revision: Number(context.marker.revision) + 1,
    });
    if (remaining === 0) window.phase = 'enrollment';
    return this.persist(context, window);
  }
  private async enroll(
    context: Awaited<ReturnType<FinanceAccountPublicationConsumer['load']>>,
    window: Window,
  ) {
    if (
      context.marker.state === 'rebuilding' ||
      Number(context.marker.coverageDeferredSourceCount ?? 0) !== 0 ||
      Object.keys(window.baseline).some((PK) => window.progress[PK] !== window.target[PK])
    )
      return fail('Finance publication window has unfinished source work.');
    const scopes = [
      ...new Set([
        context.account.scopeKey.PK,
        ...Object.keys(context.marker.coverageDependencyUseCounts as object),
      ]),
    ].sort();
    if (
      scopes.length > 80 ||
      window.registryOffset > scopes.length ||
      scopes.some((PK) => window.target[PK] === undefined)
    )
      return fail('Finance publication dependency enrollment is incomplete.');
    for (const PK of scopes.slice(window.registryOffset, window.registryOffset + 10)) {
      const key = projectionDependencyKey(PK, context.account.value.id),
        row = await context.work.get(key);
      if (
        row &&
        (row.format !== projectionDependencyFormat ||
          row.accountId !== context.account.value.id ||
          row.dependencyScope !== PK)
      )
        return fail('Finance publication dependency directory identity conflict.');
      if (!row)
        await context.work.put({
          ...key,
          format: projectionDependencyFormat,
          accountId: context.account.value.id,
          dependencyScope: PK,
        });
    }
    window.registryOffset = Math.min(scopes.length, window.registryOffset + 10);
    if (window.registryOffset < scopes.length) return this.persist(context, window);
    const count = await context.work.get({
      PK: `FINANCE#FACT_ACCOUNT#${context.account.value.id}`,
      SK: 'CARDINALITY',
    });
    if (
      !Number.isSafeInteger(count?.facts ?? 0) ||
      (count?.facts ?? 0) !== context.marker.coverageSourceCount
    )
      return fail('Finance publication source cardinality invariant failed.');
    const ready: typeof context.marker = {
      ...context.marker,
      state: 'ready',
      coverageVerified: true,
      coverageDependencies: Object.fromEntries(scopes.map((PK) => [PK, window.target[PK]!])),
      sourceScopeRevision: context.account.scopeRevision,
      revision: Number(context.marker.revision) + 1,
      coverageDigest: createHash('sha256')
        .update(
          JSON.stringify([
            context.marker.coverageDigest,
            window.id,
            window.target,
            context.marker.coverageSourceCount,
            context.marker.coverageDependencyUseCounts,
            context.marker.coverageOriginalSourceUseCounts,
          ]),
        )
        .digest('hex'),
    };
    delete ready.coverageWindowId;
    await context.work.put(ready);
    window.phase = 'complete';
    return this.persist(context, window, true);
  }
}
