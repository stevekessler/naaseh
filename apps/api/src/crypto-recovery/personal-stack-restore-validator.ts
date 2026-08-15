import { createHash } from 'node:crypto';

type Row = { PK: string; SK: string; data: Record<string, unknown> };
type WorkReference = { workType: 'task' | 'list'; workId: string; membershipEpoch: string };

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identity = (work: WorkReference) => `${work.workType}:${work.workId}:${work.membershipEpoch}`;

function scopeFromPk(pk: string) {
  const match = /^STACK#USER#(.+)#(OVERALL|PROJECT#(.+))$/u.exec(pk);
  if (!match) throw new Error('Personal stack row has an invalid owner or scope boundary.');
  return match[2] === 'OVERALL'
    ? { userId: match[1]!, scopeType: 'overall' as const }
    : { userId: match[1]!, scopeType: 'project' as const, scopeId: match[3]! };
}

function assertScope(data: Record<string, unknown>, scope: ReturnType<typeof scopeFromPk>) {
  if (data.userId !== scope.userId || data.scopeType !== scope.scopeType)
    throw new Error('Personal stack owner or user scope boundary mismatch.');
  if (
    (scope.scopeType === 'project' && data.scopeId !== scope.scopeId) ||
    (scope.scopeType === 'overall' && data.scopeId !== undefined)
  )
    throw new Error('Personal stack Project scope boundary mismatch.');
}

function move(
  order: WorkReference[],
  operation: Record<string, unknown>,
  affected: WorkReference[],
) {
  const moved = operation.movedWork as WorkReference;
  const without = order.filter((work) => identity(work) !== identity(moved));
  if (operation.kind === 'filtered_permutation') {
    const slots = affected.map((work) =>
      order.findIndex((candidate) => identity(candidate) === identity(work)),
    );
    if (slots.some((slot) => slot < 0))
      throw new Error('Canonical operation affected work is stale.');
    const permutation = affected.filter((work) => identity(work) !== identity(moved));
    permutation.splice(Number(operation.destinationIndex), 0, moved);
    const next = [...order];
    [...slots]
      .sort((a, b) => a - b)
      .forEach((slot, index) => {
        next[slot] = permutation[index]!;
      });
    return next;
  }
  const before = operation.beforeWork as WorkReference | undefined;
  const after = operation.afterWork as WorkReference | undefined;
  const index = before
    ? without.findIndex((work) => identity(work) === identity(before))
    : after
      ? without.findIndex((work) => identity(work) === identity(after)) + 1
      : without.length;
  if (index < 0) throw new Error('Canonical operation anchor is unavailable.');
  without.splice(index, 0, moved);
  return without;
}

function validateScope(rows: Row[]) {
  const scope = scopeFromPk(rows[0]!.PK);
  const metaRow = rows.find((row) => row.SK === 'META');
  if (!metaRow) throw new Error('Personal stack scope has no metadata owner boundary.');
  assertScope(metaRow.data, scope);
  const version = Number(metaRow.data.version);
  const snapshotThroughVersion = Number(metaRow.data.snapshotThroughVersion ?? 0);
  if (snapshotThroughVersion > version)
    throw new Error('Personal stack snapshot pointer exceeds canonical version.');

  const memberships = rows
    .filter((row) => row.SK.startsWith('MEMBERSHIP#'))
    .map((row) => {
      assertScope(row.data, scope);
      return row.data as unknown as WorkReference & { admittedSequence?: number; active?: boolean };
    })
    .filter((work) => work.active !== false)
    .sort(
      (left, right) =>
        (left.admittedSequence ?? 0) - (right.admittedSequence ?? 0) ||
        identity(left).localeCompare(identity(right)),
    );

  const operations = rows
    .map((row) => ({ row, match: /^OP#(\d{12})#([^#]+)$/u.exec(row.SK) }))
    .filter((entry) => entry.match)
    .sort((left, right) => Number(left.match![1]) - Number(right.match![1]));
  if (operations.length !== version)
    throw new Error('Canonical personal stack operation continuity has a version gap.');
  operations.forEach((entry, index) => {
    if (Number(entry.match![1]) !== index + 1)
      throw new Error('Canonical personal stack operation continuity has a version gap.');
    assertScope(entry.row.data, scope);
  });

  const affectedByVersion = new Map<number, WorkReference[]>();
  for (const entry of operations) {
    const operationVersion = Number(entry.match![1]);
    const operationId = entry.match![2]!;
    const chunkCount = Number(entry.row.data.chunkCount ?? 0);
    const chunks = rows
      .map((row) => ({
        row,
        match: new RegExp(`^OP#${entry.match![1]}#${operationId}#CHUNK#(\\d{12})$`, 'u').exec(
          row.SK,
        ),
      }))
      .filter((candidate) => candidate.match)
      .sort((left, right) => Number(left.match![1]) - Number(right.match![1]));
    if (chunks.length !== chunkCount)
      throw new Error('Canonical personal stack operation chunk is missing from its owner scope.');
    const affected: WorkReference[] = [];
    chunks.forEach((chunk, index) => {
      if (Number(chunk.match![1]) !== index)
        throw new Error('Canonical operation chunks are not contiguous.');
      assertScope({ ...entry.row.data, ...chunk.row.data }, scope);
      const workRefs = chunk.row.data.workRefs as WorkReference[];
      if (digest(workRefs) !== chunk.row.data.checksum)
        throw new Error('Canonical operation chunk checksum is invalid.');
      affected.push(...workRefs);
    });
    if (chunkCount && digest(affected) !== entry.row.data.affectedHash)
      throw new Error('Canonical operation aggregate hash is invalid.');
    affectedByVersion.set(operationVersion, affected);
  }

  const generation = Number(metaRow.data.currentSnapshotGeneration ?? 0);
  const snapshotRows = rows
    .map((row) => ({ row, match: /^SNAPSHOT#(\d{12})#CHUNK#(\d{12})$/u.exec(row.SK) }))
    .filter((entry) => entry.match && Number(entry.match[1]) === generation)
    .sort((left, right) => Number(left.match![2]) - Number(right.match![2]));
  let snapshotStatus: 'verified' | 'rebuilt' = 'verified';
  let order: WorkReference[] = [];
  if (generation && snapshotRows.length) {
    try {
      snapshotRows.forEach((entry, index) => {
        if (Number(entry.match![2]) !== index)
          throw new Error('Snapshot chunks are not contiguous.');
        assertScope(entry.row.data, scope);
        const refs = entry.row.data.workRefs as WorkReference[];
        if (
          Number(entry.row.data.throughVersion) !== snapshotThroughVersion ||
          digest(refs) !== entry.row.data.checksum
        )
          throw new Error('Snapshot checksum or pointer is invalid.');
        order.push(...refs);
      });
    } catch {
      snapshotStatus = 'rebuilt';
      order = [];
    }
  } else if (generation) snapshotStatus = 'rebuilt';

  const replayFrom = snapshotStatus === 'verified' && order.length ? snapshotThroughVersion + 1 : 1;
  if (replayFrom === 1)
    order = memberships.map(({ workType, workId, membershipEpoch }) => ({
      workType,
      workId,
      membershipEpoch,
    }));
  for (const entry of operations) {
    const operationVersion = Number(entry.match![1]);
    if (operationVersion < replayFrom) continue;
    const operation = entry.row.data;
    const affected =
      operation.kind === 'filtered_permutation'
        ? (affectedByVersion.get(operationVersion) ?? [])
        : [operation.movedWork as WorkReference];
    order = move(order, operation, affected);
  }

  return { ...scope, version, snapshotStatus, order };
}

export function validatePersonalStackRestore(rows: Row[]) {
  if (JSON.stringify(rows).toLocaleLowerCase().includes('extra_low'))
    throw new Error('Personal stack restore contains an unsupported Extra Low value.');
  const grouped = new Map<string, Row[]>();
  for (const row of rows) grouped.set(row.PK, [...(grouped.get(row.PK) ?? []), row]);
  return {
    scopes: [...grouped.values()]
      .map(validateScope)
      .sort((a, b) =>
        `${a.userId}:${a.scopeType}:${'scopeId' in a ? a.scopeId : ''}`.localeCompare(
          `${b.userId}:${b.scopeType}:${'scopeId' in b ? b.scopeId : ''}`,
        ),
      ),
  };
}
