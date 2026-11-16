import { identifyCsvDuplicateOrdinals } from './csv-import-service.js';
import { BatchGetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  financialTaskLinkSchema,
  sumSpendByCurrency,
  filterSpendSlices,
  type FinancialTaskLink,
} from '@naaseh/domain';
import {
  FINANCE_MAX_EXAMINED,
  decodeFinanceCursor,
  encodeFinanceCursor,
  matchesFinanceCalendar,
  matchesFinanceFact,
  isFinanceFactBefore,
  compareFinanceRows,
  normalizeFinanceText,
  parseFinanceReadRequest,
  type FinanceFact,
  type FinanceReadContext,
  type FinanceReadRequest,
  type FinanceReadResult,
  type FinanceCursorKey,
} from './query-contract.js';
import { textPostingOrdinals, textOrdinalKey } from './text-postings.js';
import { financeTextGrams } from './text-postings.js';
import {
  financeAccountReadSummarySchema,
  supportsFinanceAccountSummary,
  type FinanceAccountReadSummary,
} from './account-read-summary.js';

type Row = {
  PK?: string;
  SK?: string;
  fact?: FinanceFact;
  transactionId?: string;
  data?: FinanceFact;
  codec?: string;
  month?: string;
  baseOrdinal?: number;
  bits?: Uint8Array;
  sourceOrdinal?: number;
  aggregate?: unknown;
};
export interface FinanceQueryClient {
  send(command: QueryCommand | BatchGetCommand): Promise<{
    Items?: Row[] | undefined;
    ScannedCount?: number | undefined;
    LastEvaluatedKey?: Record<string, unknown> | undefined;
    Responses?: Record<string, Row[]> | undefined;
    UnprocessedKeys?: Record<string, unknown> | undefined;
  }>;
}
export interface FinanceReadOptions {
  client: FinanceQueryClient;
  tableName: string;
  cursorSecret: string;
  estimate?: (partitions: readonly string[]) => Promise<ReadonlyMap<string, number>>;
  loadDashboardCategories?: (facts: FinanceFact[]) => Promise<void>;
  authorize: (
    context: FinanceReadContext,
    originalSourceAccountIds?: readonly string[],
    budgetIds?: readonly string[],
  ) => Promise<boolean>;
}

export const financeReadKeys = {
  fact: (id: string) => ({ PK: `FINANCE#FACT#${id}`, SK: 'CURRENT' }),
  account: (id: string) => `FINANCE#FACT_ACCOUNT#${id}`,
  dimension: (accountId: string, kind: string, id: string) =>
    `FINANCE#FACT_DIM#${kind}#${id}#${accountId}`,
  probe: (accountId: string, kind: string, value: string) =>
    `FINANCE#FACT_SEARCH#${accountId}#${kind}#${encodeURIComponent(value)}`,
  date: (fact: Pick<FinanceFact, 'effectiveAt' | 'id'>) => `DATE#${fact.effectiveAt}#${fact.id}`,
};

const taskLinkPartition = (taskId: string) => `FINANCE#TASK#${taskId}`;
const targetLinkPartition = (targetType: string, targetId: string) =>
  `FINANCE#TASK_TARGET#${targetType}#${targetId}`;

/** Bounded read primitive. Query coordination handles OR partitions and automatic completion. */
export class FinanceReadRepository {
  constructor(private readonly options: FinanceReadOptions) {
    if (options.cursorSecret.length < 32)
      throw new Error('Finance cursor signing secret is too short.');
  }

  async read(input: FinanceReadRequest): Promise<FinanceReadResult> {
    return (await this.scan(input)).page;
  }

  /** Bounded reverse-partition reads; callers still authorize each task and target independently. */
  async financialTaskLinksForTasks(taskIds: readonly string[]) {
    if (!taskIds.length || taskIds.length > 50 || new Set(taskIds).size !== taskIds.length)
      throw new Error('Finance task batch must contain 1 to 50 unique task ids.');
    const pages = await Promise.all(
      taskIds.map((taskId) =>
        this.options.client.send(
          new QueryCommand({
            TableName: this.options.tableName,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
            ExpressionAttributeValues: {
              ':pk': taskLinkPartition(taskId),
              ':prefix': 'TARGET_LINK#',
            },
            ConsistentRead: true,
            Limit: 51,
          }),
        ),
      ),
    );
    const result = new Map<string, FinancialTaskLink[]>();
    pages.forEach((page, index) => {
      const taskId = taskIds[index]!;
      if (page.LastEvaluatedKey || (page.Items?.length ?? 0) > 50)
        throw new Error('Finance task relationship projection exceeds its bounded size.');
      result.set(
        taskId,
        (page.Items ?? []).map((row) => {
          const link = financialTaskLinkSchema.parse(row.data);
          if (
            link.taskId !== taskId ||
            row.PK !== taskLinkPartition(taskId) ||
            row.SK !== `TARGET_LINK#${link.id}`
          )
            throw new Error('Finance task relationship projection is incomplete.');
          return link;
        }),
      );
    });
    return result;
  }

  async financialTaskLinksForTarget(targetType: string, targetId: string) {
    if (!['budgetItem', 'transaction', 'upcomingExpense'].includes(targetType) || !targetId)
      throw new Error('Invalid Finance task target.');
    const PK = targetLinkPartition(targetType, targetId);
    const page = await this.options.client.send(
      new QueryCommand({
        TableName: this.options.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': PK, ':prefix': 'TASK_LINK#' },
        ConsistentRead: true,
        Limit: 51,
      }),
    );
    if (page.LastEvaluatedKey || (page.Items?.length ?? 0) > 50)
      throw new Error('Finance target relationship projection exceeds its bounded size.');
    return (page.Items ?? []).map((row) => {
      const link = financialTaskLinkSchema.parse(row.data);
      if (
        link.targetType !== targetType ||
        link.targetId !== targetId ||
        row.PK !== PK ||
        row.SK !== `TASK_LINK#${link.id}`
      )
        throw new Error('Finance target relationship projection is incomplete.');
      return link;
    });
  }

  /** Caller establishes the canonical account revision before and after this bounded read. */
  async csvDuplicateOrdinals(
    accountId: string,
    rows: Parameters<typeof identifyCsvDuplicateOrdinals>[1]['rows'],
  ): Promise<number[]> {
    const normalized = rows.map((row) => ({
      ...row,
      transactedAt: new Date(row.transactedAt).toISOString(),
    }));
    const times = normalized.map(({ transactedAt }) => transactedAt).sort();
    if (!times.length || times.length > 100) throw new Error('Invalid CSV duplicate check.');
    const partition = financeReadKeys.account(accountId);
    const page = await this.options.client.send(
      new QueryCommand({
        TableName: this.options.tableName,
        KeyConditionExpression: 'PK = :pk AND SK BETWEEN :start AND :end',
        ExpressionAttributeValues: {
          ':pk': partition,
          ':start': `DATE#${times[0]}#`,
          ':end': `DATE#${times.at(-1)}#\uffff`,
        },
        ConsistentRead: true,
        Limit: 200,
      }),
    );
    if (page.LastEvaluatedKey || (page.Items?.length ?? 0) > 200)
      throw new Error('CSV duplicate check needs a narrower date range.');
    const entries = page.Items ?? [];
    const timesToCheck = new Set(times);
    const references = entries.filter((row) => {
      if (
        row.PK !== partition ||
        !row.transactionId ||
        !row.SK?.endsWith(`#${row.transactionId}`) ||
        !row.SK.startsWith('DATE#')
      )
        throw new Error('Finance CSV projection is incomplete.');
      return timesToCheck.has(row.SK.slice(5, -row.transactionId.length - 1));
    });
    const facts = new Map<string, FinanceFact>();
    const keys = [
      ...new Set(references.filter((row) => !row.fact).map((row) => row.transactionId!)),
    ];
    for (let offset = 0; offset < keys.length; offset += 100) {
      const result = await this.options.client.send(
        new BatchGetCommand({
          RequestItems: {
            [this.options.tableName]: {
              Keys: keys.slice(offset, offset + 100).map(financeReadKeys.fact),
              ConsistentRead: true,
            },
          },
        }),
      );
      if (result.UnprocessedKeys && Object.keys(result.UnprocessedKeys).length)
        throw new Error('Finance CSV projection is incomplete.');
      for (const row of result.Responses?.[this.options.tableName] ?? []) {
        const fact = row.fact ?? row.data;
        if (fact) facts.set(fact.id, fact);
      }
    }
    const matched = references.map((row) => {
      const fact = row.fact ?? facts.get(row.transactionId!);
      if (
        !fact ||
        fact.id !== row.transactionId ||
        fact.accountId !== accountId ||
        financeReadKeys.date(fact) !== row.SK ||
        !Number.isSafeInteger(fact.amountMinor) ||
        typeof fact.description !== 'string'
      )
        throw new Error('Finance CSV projection is incomplete.');
      return fact;
    });
    return identifyCsvDuplicateOrdinals(matched, { accountId, rows: normalized });
  }

  private async expandShortPostings(
    rows: Row[],
    accountId: string,
    cursor?: FinanceCursorKey,
  ): Promise<Row[]> {
    const candidates: Array<{ source: Row; ordinal: number; key: { PK: string; SK: string } }> = [];
    if (rows.length > 2) throw new Error('Finance compact read exceeds row budget.');
    for (const row of rows) {
      if (
        (row.codec !== 'short-text-v1' && row.codec !== 'text-bitmap-v2') ||
        !row.bits ||
        typeof row.baseOrdinal !== 'number' ||
        !row.month ||
        !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(row.month)
      )
        throw new Error('Malformed Finance compact posting; rebuild required.');
      const ordinals = textPostingOrdinals(row.bits, row.baseOrdinal);
      if (!ordinals.length) throw new Error('Empty Finance posting requires repair.');
      for (const ordinal of ordinals) {
        if (
          cursor?.beforeOrdinal !== undefined &&
          cursor.SK === row.SK &&
          ordinal >= cursor.beforeOrdinal
        )
          continue;
        candidates.push({
          source: row,
          ordinal,
          key: textOrdinalKey(accountId, row.month, ordinal),
        });
      }
    }
    if (candidates.length > FINANCE_MAX_EXAMINED)
      throw new Error('Finance examined-row budget exceeded.');
    const loaded = new Map<string, FinanceFact>();
    const keyId = (key: { PK?: string; SK?: string }) => JSON.stringify([key.PK, key.SK]);
    for (let group = 0; group < candidates.length; group += 500) {
      const chunks = [];
      for (let offset = group; offset < Math.min(group + 500, candidates.length); offset += 100)
        chunks.push(
          candidates.slice(offset, Math.min(offset + 100, group + 500)).map((c) => c.key),
        );
      const results = await Promise.all(
        chunks.map((Keys) =>
          this.options.client.send(
            new BatchGetCommand({
              RequestItems: {
                [this.options.tableName]: { Keys, ConsistentRead: true },
              },
            }),
          ),
        ),
      );
      for (const result of results) {
        if (result.UnprocessedKeys && Object.keys(result.UnprocessedKeys).length)
          throw new Error('Finance compact read incomplete; retry required.');
        for (const row of result.Responses?.[this.options.tableName] ?? [])
          if (row.fact) loaded.set(keyId(row), row.fact);
      }
    }
    return candidates.map((candidate) => {
      const fact = loaded.get(keyId(candidate.key));
      if (
        !fact ||
        fact.textOrdinal !== candidate.ordinal ||
        fact.textMonth !== candidate.source.month
      )
        throw new Error('Finance ordinal fact incomplete; rebuild required.');
      return { ...candidate.source, sourceOrdinal: candidate.ordinal, fact };
    });
  }

  async scan(input: FinanceReadRequest) {
    return this.scanPartition(input, false);
  }

  /** Only private workers consume compact aggregates; public reads always hydrate real facts. */
  async scanForJob(input: FinanceReadRequest) {
    return (await this.scanPartition(input, true)).step;
  }
  async preview(input: FinanceReadRequest) {
    return (await this.scanPartition(input, true, true)).step;
  }

  private async scanPartition(
    input: FinanceReadRequest,
    aggregateOnly: boolean,
    requireCompact = false,
  ) {
    const request = parseFinanceReadRequest(input);
    const { userId, accountId, sourceRevision, securityRevision, filters, limit } = request;
    const context = {
      userId,
      accountId,
      sourceRevision,
      securityRevision,
      filters,
      ...(request.before ? { before: request.before } : {}),
    };
    const key = request.cursor
      ? decodeFinanceCursor(request.cursor, context, this.options.cursorSecret)
      : undefined;
    if (!(await this.options.authorize(context))) throw new Error('Finance read access denied.');
    let partition = financeReadKeys.account(accountId);
    let compactText = false;
    if (filters.checkNumber)
      partition = financeReadKeys.probe(accountId, 'check', filters.checkNumber);
    else if (filters.amount !== undefined)
      partition = financeReadKeys.probe(
        accountId,
        'amount',
        `${filters.currency ?? '*'}:${filters.amount}`,
      );
    else if (filters.text) {
      const characters = Array.from(normalizeFinanceText(filters.text));
      compactText = true;
      partition = financeReadKeys.probe(accountId, 'text', characters.slice(0, 3).join(''));
    } else {
      const dimension = [
        ['budget', filters.budgetIds],
        ['subcategory', filters.subcategoryIds],
        ['merchant', filters.merchantIds],
        ['category', filters.categoryIds],
      ] as const;
      for (const [kind, ids] of dimension)
        if (ids?.length === 1) {
          partition = financeReadKeys.dimension(accountId, kind, ids[0]!);
          break;
        }
    }
    const probes = new Map<string, boolean>([[partition, compactText]]);
    if (filters.checkNumber)
      probes.set(financeReadKeys.probe(accountId, 'check', filters.checkNumber), false);
    if (filters.amount !== undefined)
      probes.set(
        financeReadKeys.probe(accountId, 'amount', `${filters.currency ?? '*'}:${filters.amount}`),
        false,
      );
    if (filters.text) {
      const characters = Array.from(normalizeFinanceText(filters.text));
      const grams =
        characters.length < 3
          ? [characters.join('')]
          : financeTextGrams(filters.text, 3, 3).slice(0, 8);
      for (const gram of grams) probes.set(financeReadKeys.probe(accountId, 'text', gram), true);
    }
    for (const [kind, ids] of [
      ['budget', filters.budgetIds],
      ['subcategory', filters.subcategoryIds],
      ['merchant', filters.merchantIds],
      ['category', filters.categoryIds],
    ] as const)
      if (ids?.length === 1) probes.set(financeReadKeys.dimension(accountId, kind, ids[0]!), false);
    if (key) {
      if (!probes.has(key.PK)) throw new Error('Invalid Finance cursor probe context.');
      partition = key.PK;
      compactText = probes.get(partition)!;
    } else if (this.options.estimate && probes.size > 1) {
      const estimates = await this.options.estimate([...probes.keys()]);
      let smallest = Number.POSITIVE_INFINITY;
      for (const [probe, compact] of probes) {
        const count = estimates.get(probe);
        if (count !== undefined && Number.isSafeInteger(count) && count >= 0 && count < smallest) {
          partition = probe;
          compactText = compact;
          smallest = count;
        }
      }
    }
    const shiftedDay = (day: string, delta: number) => {
      const value = new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000)
        .toISOString()
        .slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
    };
    const from = filters.date ?? filters.dateFrom;
    const to = filters.date ?? filters.dateTo;
    const broadFrom = from ? shiftedDay(from, -1) : undefined;
    const broadTo = to ? shiftedDay(to, 2) : undefined;
    const prefix = broadFrom ? `DATE#${compactText ? broadFrom.slice(0, 7) : broadFrom}` : 'DATE#';
    let last = broadTo
      ? `DATE#${compactText ? broadTo.slice(0, 7) : broadTo}\uffff`
      : 'DATE#\uffff';
    if (request.before) {
      // Keep the boundary day/month inclusive; exact timestamp/ID ordering is
      // checked after loading candidates, including legacy ISO precision variants.
      const before = `DATE#${request.before.effectiveAt.slice(0, compactText ? 7 : 10)}\uffff`;
      if (before < last) last = before;
    }
    if (key?.beforeOrdinal !== undefined && key.SK < last) last = key.SK;
    const ranged = Boolean(from || to || request.before || key?.beforeOrdinal !== undefined);
    const page = await this.options.client.send(
      new QueryCommand({
        TableName: this.options.tableName,
        KeyConditionExpression: ranged
          ? 'PK = :pk AND SK BETWEEN :prefix AND :last'
          : 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': partition,
          ':prefix': prefix,
          ...(ranged ? { ':last': last } : {}),
        },
        ConsistentRead: true,
        Limit: compactText ? 2 : FINANCE_MAX_EXAMINED,
        ScanIndexForward: false,
        ...(key && key.beforeOrdinal === undefined
          ? { ExclusiveStartKey: { PK: key.PK, SK: key.SK } }
          : {}),
      }),
    );
    const rows = compactText
      ? await this.expandShortPostings(page.Items ?? [], accountId, key)
      : (page.Items ?? []);
    const examined = compactText ? rows.length : (page.ScannedCount ?? rows.length);
    if (page.LastEvaluatedKey && (examined === 0 || (key && page.LastEvaluatedKey.SK === key.SK)))
      throw new Error('Finance query cursor did not advance.');
    if (examined > FINANCE_MAX_EXAMINED || rows.length > FINANCE_MAX_EXAMINED)
      throw new Error('Finance examined-row budget exceeded.');
    const { transactionBrowse, ...summaryFilters } = filters;
    const useAggregates =
      aggregateOnly &&
      partition === financeReadKeys.account(accountId) &&
      (!transactionBrowse || requireCompact) &&
      supportsFinanceAccountSummary(summaryFilters);
    const compact = new Map<Row, FinanceAccountReadSummary>();
    if (requireCompact && !useAggregates)
      throw new Error('Finance ordered preview scope is invalid.');
    if (useAggregates)
      for (const row of rows) {
        if (requireCompact && row.aggregate === undefined)
          throw new Error('Finance ordered aggregate reference is unavailable.');
        if (row.aggregate === undefined) continue; // Legacy references still load bounded canonical facts.
        const parsed = financeAccountReadSummarySchema.safeParse(row.aggregate);
        if (
          !parsed.success ||
          parsed.data.accountId !== accountId ||
          parsed.data.id !== row.transactionId ||
          row.PK !== partition ||
          row.SK !== financeReadKeys.date(parsed.data)
        )
          throw new Error('Finance aggregate projection invariant failed.');
        compact.set(row, parsed.data);
      }
    const references = [
      ...new Set(
        rows
          .filter((row) => !compact.has(row) && !row.fact && row.transactionId)
          .map((row) => row.transactionId!),
      ),
    ];
    const loaded = new Map<string, FinanceFact>();
    for (let offset = 0; offset < references.length; offset += 100) {
      const result = await this.options.client.send(
        new BatchGetCommand({
          RequestItems: {
            [this.options.tableName]: {
              Keys: references.slice(offset, offset + 100).map(financeReadKeys.fact),
              ConsistentRead: true,
            },
          },
        }),
      );
      if (result.UnprocessedKeys && Object.keys(result.UnprocessedKeys).length)
        throw new Error('Finance indexed read incomplete; retry required.');
      for (const row of result.Responses?.[this.options.tableName] ?? []) {
        const fact = row.fact ?? row.data;
        if (fact) loaded.set(fact.id, fact);
      }
    }
    if (filters.dashboardCategoryIds) {
      if (!this.options.loadDashboardCategories)
        throw new Error('Finance category lookup is unavailable.');
      const candidates = rows.map(
        (row) => row.fact ?? (row.transactionId ? loaded.get(row.transactionId) : undefined),
      );
      if (candidates.some((fact) => !fact || fact.accountId !== accountId))
        throw new Error('Finance category projection is incomplete.');
      await this.options.loadDashboardCategories(candidates as FinanceFact[]);
    }
    const matches: Array<{ fact: FinanceFact; row: Row }> = [];
    const aggregateMatches: FinanceAccountReadSummary[] = [];
    for (const row of rows) {
      const summary = compact.get(row);
      if (summary) {
        if (
          summary.active &&
          (!filters.postedSpendOnly || summary.hasSpend) &&
          (!filters.accountIds?.length || filters.accountIds.includes(accountId)) &&
          matchesFinanceCalendar(summary.effectiveAt, filters) &&
          isFinanceFactBefore(summary, request.before)
        )
          aggregateMatches.push(summary);
        continue;
      }
      const fact = row.fact ?? (row.transactionId ? loaded.get(row.transactionId) : undefined);
      if (!fact) throw new Error('Finance projection incomplete; rebuild required.');
      if (fact.accountId !== accountId)
        throw new Error('Finance projection account invariant failed.');
      if (matchesFinanceFact(fact, filters) && isFinanceFactBefore(fact, request.before))
        matches.push({ fact, row });
    }
    const selected = matches.slice(0, limit);
    let nextKey: FinanceCursorKey | undefined;
    if (matches.length > limit) {
      const last = selected.at(-1)!.row;
      if (!last.PK || !last.SK) throw new Error('Finance projection cursor key missing.');
      nextKey = {
        PK: last.PK,
        SK: last.SK,
        ...(last.sourceOrdinal !== undefined ? { beforeOrdinal: last.sourceOrdinal } : {}),
      };
    } else if (page.LastEvaluatedKey) {
      const last = page.LastEvaluatedKey;
      if (typeof last.PK !== 'string' || typeof last.SK !== 'string')
        throw new Error('Invalid Finance projection cursor key.');
      nextKey = { PK: last.PK, SK: last.SK };
    }
    const originals = [
      ...new Set([
        ...matches.flatMap(({ fact }) => fact.originalSourceAccountIds ?? []),
        ...aggregateMatches.flatMap((summary) => summary.originalSourceAccountIds),
      ]),
    ];
    const budgets = [
      ...new Set([
        ...matches.flatMap(({ fact }) =>
          fact.slices.flatMap((slice) => (slice.budgetId ? [slice.budgetId] : [])),
        ),
        ...aggregateMatches.flatMap((summary) => summary.budgetIds),
      ]),
    ];
    if (!(await this.options.authorize(context, originals, budgets)))
      throw new Error('Finance read authorization changed.');
    const items = selected.map(({ fact }) => fact);
    const complete = !page.LastEvaluatedKey && !request.cursor;
    const allSlices = [
      ...matches.flatMap(({ fact }) => filterSpendSlices(fact.slices, filters)),
      ...aggregateMatches.flatMap((summary) =>
        summary.totals.map((total) => ({
          ...total,
          transactionId: summary.id,
          accountId: summary.accountId,
          effectiveAt: summary.effectiveAt,
        })),
      ),
    ];
    const stepTotals = sumSpendByCurrency(
      filters.transactionBrowse
        ? matches.map(({ fact }) => ({
            transactionId: fact.id,
            accountId: fact.accountId,
            effectiveAt: fact.effectiveAt,
            currency: fact.currency,
            currencyExponent: fact.currencyExponent,
            amountMinor: fact.amountMinor,
          }))
        : allSlices,
    );
    const pageResult: FinanceReadResult = {
      items,
      ...(nextKey
        ? { nextCursor: encodeFinanceCursor(nextKey, context, this.options.cursorSecret) }
        : {}),
      asOf: new Date().toISOString(),
      projectionRevision: sourceRevision,
      complete,
      rowsState: items.length
        ? 'ready'
        : !nextKey && !request.cursor
          ? 'confirmed-empty'
          : 'searching',
      aggregateState: complete ? 'exact' : 'pending',
      coverage: { examined, scopeComplete: complete },
      ...(complete ? { totalCount: matches.length, totalsByCurrency: stepTotals } : {}),
    };
    const scanKey = page.LastEvaluatedKey as { PK: string; SK: string } | undefined;
    return {
      page: pageResult,
      step: {
        topRows: [
          ...matches.map(({ fact }) => fact),
          ...aggregateMatches.map(({ id, accountId, effectiveAt }) => ({
            id,
            accountId,
            effectiveAt,
          })),
        ]
          .sort(compareFinanceRows)
          .slice(0, 200),
        matchedCount: matches.length + aggregateMatches.length,
        totalsByCurrency: stepTotals,
        examined,
        ...(scanKey
          ? { nextCursor: encodeFinanceCursor(scanKey, context, this.options.cursorSecret) }
          : {}),
      },
    };
  }
}
