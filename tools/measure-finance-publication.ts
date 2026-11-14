import { financePublicationConsumerFixture } from '../tests/fixtures/finance/publication.js';
import { FinancePublicationOutboxConsumer } from '../apps/api/src/finance/publication-outbox-consumer.js';
import {
  projectionDependencyKey,
  projectionDependencyFormat,
} from '../apps/api/src/finance/projection-dependency-directory.js';
import { experienceId } from '../tests/fixtures/finance/experience.js';

/** Offline generated-command accounting. All persistence/query paths are injected; no AWS calls. */
delete process.env.NAASEH_FINANCE_PUBLICATION_EVENT_BUS;
console.info = (...values: unknown[]) => console.error(...values);
const bytes = (value: unknown) =>
  value ? Buffer.byteLength(JSON.stringify(value), 'utf8') + 100 : 0;
async function measure(
  accountCount: number,
  action: 'create' | 'correct' | 'delete' | 'move' | 'metadata-batch' | 'metadata-single',
  completeAccounts = false,
) {
  const f = await financePublicationConsumerFixture(
    false,
    completeAccounts ? accountCount : 1,
    true,
  );
  const groups = new Map<
    string,
    { transactions: number; estimatedWriteUnits: number; conditionChecks: number }
  >();
  const originalWrite = f.persistence.write;
  f.persistence.write = async (items) => {
    const names = items.map((item) => String(item.Put?.Item?.SK ?? ''));
    const group = names.some((name) => name.startsWith('PROJECTION_RECEIPT#'))
      ? 'source-publication'
      : names.some((name) => name.startsWith('COVERAGE_APPLICATION_RECEIPT#'))
        ? 'source-coverage-application'
        : names.some((name) => name.startsWith('PUBLICATION_WINDOW_RECEIPT#'))
          ? 'account-window'
          : names.some((name) => name.startsWith('PUBLICATION_RECEIPT#'))
            ? 'outbox-routing-and-archive'
            : 'canonical-fixture';
    const stats = groups.get(group) ?? {
      transactions: 0,
      estimatedWriteUnits: 0,
      conditionChecks: 0,
    };
    stats.transactions++;
    for (const item of items) {
      if (item.ConditionCheck) {
        stats.conditionChecks++;
        continue;
      }
      const operation = item.Put ?? item.Delete;
      if (!operation) throw new Error('Unsupported sizing operation.');
      const key = ('Item' in operation ? operation.Item : operation.Key) as {
        PK: string;
        SK: string;
      };
      stats.estimatedWriteUnits +=
        2 * Math.ceil(Math.max(1, bytes(f.rows.get(f.key(key))), bytes(item.Put?.Item)) / 1024);
    }
    groups.set(group, stats);
    await originalWrite(items);
  };
  if (action === 'metadata-batch' || action === 'metadata-single') {
    for (let index = 0; index < (action === 'metadata-batch' ? 30 : 1); index++) {
      const unit = f.work(),
        id = experienceId(7000 + index);
      await unit.put({
        PK: f.PK,
        SK: `ROW#importJobs#${id}`,
        collection: 'importJobs',
        entryKey: id,
        data: { id, version: 1 },
      });
      const meta = await unit.get(f.meta);
      await unit.put({ ...meta!, revision: Number(meta!.revision) + 1 });
      await unit.commit({
        key: { PK: 'SIZING', SK: `metadata#${index}` },
        fingerprint: `metadata#${index}`,
        result: true,
        expiresAt: 2_000_000_000,
      });
    }
  } else if (action === 'delete') await f.remove();
  else if (action === 'move') await f.move('FINANCE#SCOPE#GROUP#sizing');
  else await f.change(experienceId(action === 'create' ? 1002 : 1000));
  const currentRevision = Number(f.rows.get(f.key(f.meta))!.revision);
  // Isolate router overhead: other accounts are already current and have no child work.
  // This is a lower bound for many-account routing, not a complete 50-account benchmark.
  for (let index = 1; !completeAccounts && index < accountCount; index++) {
    const accountId = experienceId(8000 + index),
      key = projectionDependencyKey(f.PK, accountId);
    f.rows.set(f.key(key), {
      ...key,
      format: projectionDependencyFormat,
      accountId,
      dependencyScope: f.PK,
    });
    const marker = { PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`, SK: 'CURRENT' };
    f.rows.set(f.key(marker), { ...marker, coverageDependencies: { [f.PK]: currentRevision } });
  }
  const worker = new FinancePublicationOutboxConsumer({
    work: f.work,
    impact: f.impact,
    account: {
      step: async (id) =>
        completeAccounts || id === f.accountId ? f.consumer.step(id) : { complete: true },
    },
  });
  const ids = [...f.rows.values()]
    .filter((row) => row.PK === 'FINANCE#PUBLICATION_OUTBOX')
    .map((row) => String(row.id));
  const initialQueryCount = f.queries.length;
  let steps = 0;
  for (const id of ids) {
    let complete = false;
    for (let step = 0; step < 1000; step++) {
      steps++;
      if ((await worker.step(id)).complete) {
        complete = true;
        break;
      }
    }
    if (!complete) throw new Error('Offline publication did not converge.');
  }
  if (
    f.rows.get(f.key(f.marker))?.coverageVerified !== true ||
    [...f.rows.values()].some((row) => row.PK === 'FINANCE#PUBLICATION_OUTBOX')
  )
    throw new Error('Offline publication left incomplete work.');
  return {
    accountCount,
    completeAccounts,
    action,
    canonicalCommits: ids.length,
    outboxSteps: steps,
    indexedQueries: f.queries.length - initialQueryCount,
    groups: Object.fromEntries(groups),
    additionalAccountWork: completeAccounts
      ? 'All eight synthetic account windows run with actual services and injected persistence.'
      : accountCount > 1
        ? 'Other accounts mocked already current; their own window/application work is excluded.'
        : 'One actual synthetic account.',
    retainedSyntheticBytes: [...f.rows.values()].reduce((sum, row) => sum + bytes(row), 0),
  };
}
async function main() {
  const results = [];
  for (const accountCount of [1, 10, 50])
    for (const action of ['create', 'correct', 'metadata-batch'] as const)
      results.push(await measure(accountCount, action));
  for (const action of [
    'create',
    'correct',
    'delete',
    'metadata-single',
    'move',
    'metadata-batch',
  ] as const)
    results.push(await measure(8, action, true));
  process.stdout.write(
    JSON.stringify(
      {
        date: new Date().toISOString().slice(0, 10),
        evidence: 'offline generated transactional-command estimates; no AWS calls',
        method:
          '2 * ceil(max(old,new) UTF-8 JSON bytes plus 100/item /1024) for transactional puts/deletes; condition-check counts reported separately.',
        caveats: [
          'Small synthetic source descriptions and spend graph, not the representative 100k projection sample.',
          'Initial fixture publication/trusted verification excluded.',
          'Only completeAccounts=true runs all child work; other many-account scenarios mock additional accounts already current.',
          'No billed capacity, read-unit total, Lambda cost, retry estimate, latency or p95 acceptance.',
        ],
        results,
      },
      null,
      2,
    ) + '\n',
  );
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
