import { FinanceAccountPublicationConsumer } from '../../../apps/api/src/finance/account-publication-consumer.js';
import { FinanceAccountCoverageVerifier } from '../../../apps/api/src/finance/account-coverage-service.js';
import { FinancePublicationJournalReader } from '../../../apps/api/src/finance/publication-journal-reader.js';
import { FinancePublicationImpactReader } from '../../../apps/api/src/finance/publication-impact-reader.js';
import { SpendProjectionService } from '../../../apps/api/src/finance/spend-projection-service.js';
import {
  FinanceUnitOfWork,
  financeLocatorKey,
} from '../../../apps/api/src/finance/unit-of-work.js';
import { financePersistenceFixture } from './persistence.js';
import { experienceId } from './experience.js';
import type { FinanceFact } from '../../../apps/api/src/finance/query-contract.js';
import type { QueryCommandInput } from '@aws-sdk/lib-dynamodb';

export async function financePublicationConsumerFixture(
  withRefund = false,
  accountCount = 1,
  boundedPublication = false,
  initialSourcesPerAccount = 2,
) {
  if (
    !Number.isInteger(initialSourcesPerAccount) ||
    initialSourcesPerAccount < 0 ||
    initialSourcesPerAccount > 2 ||
    (withRefund && initialSourcesPerAccount === 0)
  )
    throw new Error('Invalid initial publication fixture source count.');
  const f = financePersistenceFixture(),
    PK = 'FINANCE#SCOPE#OWNER#owner';
  const accountId = experienceId(100),
    merchantId = experienceId(200);
  const work = () => new FinanceUnitOfWork(f.persistence, 'table');
  const meta = { PK, SK: 'META' },
    catalog = { PK: 'FINANCE#CATALOG', SK: 'META' };
  for (const key of [meta, catalog]) f.rows.set(f.key(key), { ...key, revision: 1 });
  const accountIds = Array.from({ length: accountCount }, (_, index) => experienceId(100 + index));
  for (const id of accountIds) {
    const account = {
      PK,
      SK: `ROW#accounts#${id}`,
      collection: 'accounts',
      entryKey: id,
      data: { id, version: 1 },
    };
    f.rows.set(f.key(account), account);
    f.rows.set(f.key(financeLocatorKey('accounts', id)), {
      ...financeLocatorKey('accounts', id),
      storageKey: { PK, SK: account.SK },
    });
  }
  const canonical = new Map<string, FinanceFact>();
  const row = (fact: FinanceFact, scopePK = PK) => ({
    PK: scopePK,
    SK: `ROW#transactions#${fact.id}`,
    collection: 'transactions',
    entryKey: fact.id,
    data: { ...fact, version: fact.sourceVersion },
  });
  for (let index = 0; index < initialSourcesPerAccount * accountCount; index++) {
    const accountId = accountIds[Math.floor(index / initialSourcesPerAccount)]!;
    const id = experienceId(
        1000 +
          Math.floor(index / initialSourcesPerAccount) * 10 +
          (index % initialSourcesPerAccount),
      ),
      effectiveAt = '2026-11-01T12:00:00.000Z';
    const fact: FinanceFact = {
      id,
      accountId,
      effectiveAt,
      amountMinor: -100,
      currency: 'USD',
      currencyExponent: 2,
      description: 'Synthetic',
      merchantId,
      merchantName: 'Before',
      sourceVersion: 1,
      sourceStatus: 'active',
      slices: [
        {
          transactionId: id,
          accountId,
          effectiveAt,
          amountMinor: 100,
          currency: 'USD',
          currencyExponent: 2,
          merchantId,
        },
      ],
    };
    if (withRefund && index === 0) {
      fact.amountMinor = 100;
      fact.originalSourceAccountIds = [experienceId(9000)];
      fact.slices = fact.slices.map((slice) => ({
        ...slice,
        amountMinor: -100,
        originalExpenseTransactionId: experienceId(9900),
        categoryId: experienceId(500),
      }));
      const original = {
        ...fact,
        id: experienceId(9900),
        accountId: experienceId(9000),
        amountMinor: -100,
        originalSourceAccountIds: [],
        slices: [],
      };
      f.rows.set(f.key(row(original)), row(original));
    }
    canonical.set(id, fact);
    f.rows.set(f.key(row(fact)), row(fact));
  }
  const extraDependencies = new Map<string, Record<string, number>>();
  const resolve = async (id: string) => {
    const fact = canonical.get(id);
    if (!fact) throw new Error('Missing canonical source');
    const scopePK = String(
      (
        f.rows.get(f.key(financeLocatorKey('accounts', fact.accountId)))?.storageKey as {
          PK: string;
        }
      ).PK,
    );
    return {
      fact,
      dependencies: {
        [scopePK]: Number(f.rows.get(f.key({ PK: scopePK, SK: 'META' }))!.revision),
        'FINANCE#CATALOG': Number(f.rows.get(f.key(catalog))!.revision),
        ...extraDependencies.get(id),
      },
      sourceKey: { PK: scopePK, SK: row(fact).SK },
    };
  };
  const publisher = new SpendProjectionService(work);
  for (const fact of canonical.values()) await publisher.publish(fact);
  let fullEnumerations = 0;
  const verifier = new FinanceAccountCoverageVerifier({
    work,
    readPage: async (partition, cursor, limit) => {
      fullEnumerations++;
      const rows = [...canonical.values()]
        .filter(
          (fact) =>
            (
              f.rows.get(f.key(financeLocatorKey('accounts', fact.accountId)))?.storageKey as {
                PK: string;
              }
            ).PK === partition,
        )
        .map((fact) => row(fact, partition))
        .sort((a, b) => (a.SK < b.SK ? -1 : 1))
        .filter((value) => !cursor || value.SK > cursor.SK);
      const page = rows.slice(0, limit);
      return {
        rows: page as never[],
        ...(rows.length > page.length ? { nextKey: { PK, SK: page.at(-1)!.SK } } : {}),
      };
    },
    expectedFact: async (value) => resolve(value.entryKey),
  });
  for (const id of accountIds) {
    let complete = false;
    for (let step = 0; step < 30; step++)
      if ((await verifier.step(id)).complete) {
        complete = true;
        break;
      }
    if (!complete) throw new Error('Initial fixture coverage did not complete');
  }
  const marker = { PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`, SK: 'CURRENT' };
  const queries: QueryCommandInput[] = [];
  const query = async (input: QueryCommandInput) => {
    queries.push(input);
    const values = input.ExpressionAttributeValues!;
    const rows = [...f.rows.values()]
      .filter(
        (value) =>
          value.PK === values[':pk'] &&
          (values[':first'] !== undefined
            ? value.SK >= values[':first'] && value.SK <= values[':last']
            : value.SK.startsWith(String(values[':prefix']))) &&
          (!input.ExclusiveStartKey || value.SK > String(input.ExclusiveStartKey.SK)),
      )
      .sort((a, b) => (a.SK < b.SK ? -1 : 1));
    const items = rows.slice(0, input.Limit);
    const last = items.at(-1);
    return {
      Items: items,
      ...(last && rows.length > items.length
        ? { LastEvaluatedKey: { PK: last.PK, SK: last.SK } }
        : {}),
    };
  };
  const journal = new FinancePublicationJournalReader({ query, get: f.persistence.get });
  const impact = new FinancePublicationImpactReader({
    query,
    marker: async (id) =>
      f.persistence.get({ PK: `FINANCE#PROJECTION_ACCOUNT#${id}`, SK: 'CURRENT' }),
  });
  let publications = 0;
  const consumer = new FinanceAccountPublicationConsumer({
    work,
    resolve,
    journal,
    impact,
    deferredPage: async (id) =>
      (
        await query({
          ConsistentRead: true,
          Limit: 5,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: {
            ':pk': `FINANCE#PROJECTION_ACCOUNT#${id}`,
            ':prefix': 'PUBLICATION_DEFERRED#',
          },
        })
      ).Items,
    ...(boundedPublication
      ? {}
      : {
          publish: async (fact: FinanceFact) => {
            publications++;
            await publisher.resumePending(fact.id);
            await publisher.publish(fact);
          },
        }),
    accountPage: async (id, cursor) => {
      const result = await query({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': `FINANCE#FACT_ACCOUNT#${id}`, ':prefix': 'DATE#' },
        Limit: 5,
        ConsistentRead: true,
        ...(cursor ? { ExclusiveStartKey: cursor } : {}),
      });
      return {
        rows: result.Items,
        ...(result.LastEvaluatedKey ? { nextKey: result.LastEvaluatedKey } : {}),
      };
    },
  });
  const change = async (id = experienceId(1000), amount = 200) => {
    const prior = canonical.get(id);
    const fact: FinanceFact = prior
      ? {
          ...prior,
          sourceVersion: Number(prior.sourceVersion) + 1,
          amountMinor: -amount,
          slices: prior.slices.map((slice) => ({ ...slice, amountMinor: amount })),
        }
      : {
          ...canonical.values().next().value!,
          id,
          sourceVersion: 1,
          slices: [],
          amountMinor: -amount,
        };
    canonical.set(id, fact);
    const unit = work();
    const scopePK = (
      f.rows.get(f.key(financeLocatorKey('accounts', fact.accountId)))?.storageKey as { PK: string }
    ).PK;
    await unit.put(row(fact, scopePK));
    const current = await unit.get({ PK: scopePK, SK: 'META' });
    await unit.put({ ...current!, revision: Number(current!.revision) + 1 });
    await unit.commit({
      key: { PK, SK: `FIXTURE_RECEIPT#${id}#${fact.sourceVersion}` },
      fingerprint: `${id}:${fact.sourceVersion}`,
      result: true,
      expiresAt: 2_000_000_000,
    });
  };
  async function finish() {
    for (let step = 0; step < 160; step++) if ((await consumer.step(accountId)).complete) return;
    throw new Error('Publication did not finish bounded steps');
  }
  return {
    ...f,
    get writes() {
      return f.writes;
    },
    PK,
    meta,
    catalog,
    accountId,
    accountIds,
    merchantId,
    marker,
    canonical,
    queries,
    work,
    row,
    consumer,
    impact,
    query,
    verifier,
    change,
    async createFacts(facts: FinanceFact[]) {
      if (
        !facts.length ||
        facts.length > 20 ||
        new Set(facts.map((fact) => fact.id)).size !== facts.length ||
        facts.some((fact) => canonical.has(fact.id) || !accountIds.includes(fact.accountId))
      )
        throw new Error('Invalid synthetic ingestion batch.');
      const unit = work();
      for (const fact of facts) await unit.put(row(fact));
      const current = await unit.get(meta);
      await unit.put({ ...current!, revision: Number(current!.revision) + 1 });
      await unit.commit({
        key: { PK, SK: `INGESTION_FIXTURE#${facts[0]!.id}` },
        fingerprint: JSON.stringify(facts),
        result: true,
        expiresAt: 2_000_000_000,
      });
      for (const fact of facts) canonical.set(fact.id, fact);
    },
    async move(scopePK: string, versionDelta = 1) {
      const unit = work(),
        locator = financeLocatorKey('accounts', accountId);
      const saved = (await unit.get(locator))!;
      const sourceKey = saved.storageKey as { PK: string; SK: string };
      const account = (await unit.get(sourceKey))!;
      await unit.delete(sourceKey);
      await unit.put({
        ...account,
        PK: scopePK,
        data: {
          ...(account.data as object),
          version: Number((account.data as { version: number }).version) + versionDelta,
        },
      });
      await unit.put({ ...saved, storageKey: { PK: scopePK, SK: sourceKey.SK } });
      for (const fact of canonical.values()) {
        if (fact.accountId !== accountId) continue;
        await unit.delete({ PK: sourceKey.PK, SK: row(fact).SK });
        await unit.put(row(fact, scopePK));
        await unit.put({
          ...financeLocatorKey('transactions', fact.id),
          storageKey: { PK: scopePK, SK: row(fact).SK },
        });
      }
      for (const PK of [sourceKey.PK, scopePK]) {
        const key = { PK, SK: 'META' },
          current = await unit.get(key);
        await unit.put({ ...current, ...key, revision: Number(current?.revision ?? 0) + 1 });
      }
      await unit.commit({
        key: {
          PK: 'FIXTURE',
          SK: `move#${accountId}#${scopePK}#${Number((account.data as { version: number }).version) + versionDelta}`,
        },
        fingerprint: `${sourceKey.PK}:${scopePK}:${Number((account.data as { version: number }).version) + versionDelta}`,
        result: true,
        expiresAt: 2_000_000_000,
      });
    },
    async remove(id = experienceId(1000)) {
      const fact = canonical.get(id);
      const scopePK = (
        f.rows.get(f.key(financeLocatorKey('accounts', fact?.accountId ?? accountId)))
          ?.storageKey as { PK: string }
      ).PK;
      canonical.delete(id);
      const unit = work();
      await unit.delete({ PK: scopePK, SK: `ROW#transactions#${id}` });
      await unit.delete(financeLocatorKey('transactions', id));
      const current = await unit.get({ PK: scopePK, SK: 'META' });
      await unit.put({ ...current!, revision: Number(current!.revision) + 1 });
      await unit.commit({
        key: { PK: 'FIXTURE', SK: `delete#${id}#${Number(current!.revision) + 1}` },
        fingerprint: `delete#${id}#${Number(current!.revision) + 1}`,
        result: true,
        expiresAt: 2_000_000_000,
      });
    },
    finish,
    fullEnumerations: () => fullEnumerations,
    publications: () => publications,
    extraDependency(id: string, scope?: string) {
      extraDependencies.set(id, scope ? { [scope]: 1 } : {});
      if (scope)
        f.rows.set(f.key({ PK: scope, SK: 'META' }), { PK: scope, SK: 'META', revision: 1 });
    },
  };
}
