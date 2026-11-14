import { loadTargetedFinanceEntity, type FinanceUnitOfWork } from './unit-of-work.js';
import { loadFinancePublicationManifest } from './publication-journal-reader.js';
import { financeAccountPublicationWindowSchema } from './publication-window.js';
import { financeAccountRelocations } from './publication-relocation.js';
import { FinanceExperienceFailure } from './telemetry.js';
import { isDeepStrictEqual } from 'node:util';
const fail = (message: string): never => {
  throw new FinanceExperienceFailure('invariant', message);
};
/** Conditions causal creation/move evidence in the caller's atomic unit of work. */
export async function assertFinanceSourceCreation(
  work: FinanceUnitOfWork,
  input: {
    publicationId: string;
    transactionId: string;
    accountId: string;
    scopePK: string;
    sourceVersion: number;
    marker: Record<string, unknown>;
    deletedAt?: { PK: string; revision: number };
  },
) {
  const { transactionId, accountId, marker } = input;
  const markerKey = { PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`, SK: 'CURRENT' };
  const account = await loadTargetedFinanceEntity<{ id: string; version?: number }>(
    work,
    'accounts',
    accountId,
  );
  if (!account || account.value.id !== accountId || account.storageKey.PK !== input.scopePK)
    return fail('Finance creation account/source scope is invalid.');
  const id = input.publicationId;
  const { manifest } = await loadFinancePublicationManifest(id, (key) => work.get(key));
  const creation = manifest.changes.find(
    (change) =>
      change.collection === 'transactions' &&
      change.sourceId === transactionId &&
      change.beforeVersion === undefined &&
      change.afterVersion !== undefined &&
      change.accountIds.includes(accountId) &&
      !change.removed &&
      !manifest.changes.some(
        (other) =>
          other.collection === 'transactions' && other.sourceId === transactionId && other.removed,
      ),
  );
  const transition = manifest.scopes.find((scope) => scope.PK === creation?.scopePK);
  let baseline = (marker.coverageDependencies as Record<string, unknown> | undefined)?.[
    creation?.scopePK ?? ''
  ];
  let sourceRevision = account.scopeRevision;
  if (creation && transition && (creation.scopePK !== input.scopePK || baseline === undefined)) {
    const saved = await work.get({ ...markerKey, SK: 'PUBLICATION_WINDOW' });
    const parsed = financeAccountPublicationWindowSchema.safeParse(saved?.data);
    if (
      !parsed.success ||
      parsed.data.id !== marker.coverageWindowId ||
      parsed.data.generation !== marker.coverageGeneration ||
      !['journals', 'deferred'].includes(parsed.data.phase)
    )
      return fail('Finance relocated creation requires its active verified publication window.');
    const window = parsed.data;
    baseline = window.baseline[creation.scopePK];
    sourceRevision = Number((await work.get({ PK: creation.scopePK, SK: 'META' }))?.revision);
    if (sourceRevision !== window.target[creation.scopePK])
      return fail('Finance relocated creation source revision changed.');
    let scopePK = creation.scopePK,
      afterVersion = -1,
      afterRevision = transition.afterRevision;
    const visited = new Set<string>();
    while (scopePK !== input.scopePK) {
      const entry = window.relocations
        ?.filter(
          (entry) =>
            entry.from === scopePK &&
            entry.beforeVersion >= afterVersion &&
            entry.fromAfterRevision > afterRevision &&
            !visited.has(entry.publicationId),
        )
        .sort((a, b) => a.afterVersion - b.afterVersion)[0];
      if (!entry) return fail('Finance relocated creation has no causal account move path.');
      const { manifest: move } = await loadFinancePublicationManifest(entry.publicationId, (key) =>
        work.get(key),
      );
      const proof = financeAccountRelocations(move, accountId)[0];
      if (
        !proof ||
        !isDeepStrictEqual(proof, entry) ||
        proof.afterVersion > Number((account.value as { version?: number }).version)
      )
        return fail('Finance relocated creation move proof is invalid.');
      for (const scope of move.scopes) {
        const journal = await work.get({
          PK: scope.PK,
          SK: `PUBLICATION_CHANGE#${String(scope.afterRevision).padStart(16, '0')}`,
        });
        if (
          journal?.format !== move.format ||
          journal.publicationId !== move.id ||
          journal.beforeRevision !== scope.beforeRevision ||
          journal.afterRevision !== scope.afterRevision ||
          (await work.get({ PK: scope.PK, SK: 'META' }))?.revision !== window.target[scope.PK]
        )
          return fail('Finance relocated creation move journal or revision is invalid.');
      }
      visited.add(entry.publicationId);
      scopePK = entry.to;
      afterVersion = entry.afterVersion;
      afterRevision = entry.toAfterRevision;
    }
  }
  if (
    !creation ||
    !transition ||
    typeof baseline !== 'number' ||
    !Number.isSafeInteger(baseline) ||
    baseline < 0 ||
    transition.afterRevision <= baseline ||
    transition.afterRevision > sourceRevision ||
    input.sourceVersion < creation.afterVersion!
  )
    return fail('Finance source creation is absent or already included in the coverage baseline.');
  const journal = await work.get({
    PK: transition.PK,
    SK: `PUBLICATION_CHANGE#${String(transition.afterRevision).padStart(16, '0')}`,
  });
  if (
    journal?.format !== manifest.format ||
    journal.publicationId !== id ||
    journal.beforeRevision !== transition.beforeRevision ||
    journal.afterRevision !== transition.afterRevision
  )
    return fail('Finance source creation journal does not match its manifest.');
  if (
    input.deletedAt &&
    transition?.PK === input.deletedAt.PK &&
    transition.afterRevision >= input.deletedAt.revision
  )
    return fail('Finance source creation does not precede its deletion.');
}
