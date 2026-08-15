import { taskTimerSchema } from '@naaseh/domain';

export interface RestoredTaskTimerRow {
  PK: string;
  SK: string;
  data?: unknown;
}

export function validateTaskTimerRestore(rows: readonly RestoredTaskTimerRow[]) {
  const timerRows = rows.filter(({ PK, SK }) => PK.startsWith('USER#') && SK.startsWith('TIMER#'));
  const currents = timerRows.filter(({ SK }) => SK === 'TIMER#CURRENT');
  const revisions = timerRows.filter(({ SK }) => SK.startsWith('TIMER#REV#'));
  const receipts = timerRows.filter(({ SK }) => SK.startsWith('TIMER#RECEIPT#'));
  const currentByOwner = new Map<string, ReturnType<typeof taskTimerSchema.parse>>();
  for (const row of currents) {
    const ownerId = row.PK.slice('USER#'.length);
    if (currentByOwner.has(ownerId)) throw new Error('Duplicate current timer for owner');
    const timer = taskTimerSchema.parse(row.data);
    if (timer.ownerId !== ownerId || timer.id !== ownerId)
      throw new Error('Restored timer owner identity is invalid');
    currentByOwner.set(ownerId, timer);
  }

  const revisionVersions = new Map<string, number[]>();
  for (const row of revisions) {
    const ownerId = row.PK.slice('USER#'.length);
    const current = currentByOwner.get(ownerId);
    if (!current) throw new Error('Orphan restored timer revision');
    const timer = taskTimerSchema.parse(row.data);
    const version = Number(row.SK.split('#')[2]);
    if (timer.ownerId !== ownerId || timer.version !== version || version > current.version)
      throw new Error('Restored timer revision continuity is invalid');
    revisionVersions.set(ownerId, [...(revisionVersions.get(ownerId) ?? []), version]);
  }
  for (const versions of revisionVersions.values()) {
    const ordered = [...versions].sort((left, right) => left - right);
    if (ordered.some((version, index) => index > 0 && version <= ordered[index - 1]!))
      throw new Error('Restored timer revisions are not strictly monotonic');
  }

  for (const row of receipts) {
    const ownerId = row.PK.slice('USER#'.length);
    const current = currentByOwner.get(ownerId);
    const data = row.data as { mutationId?: unknown; status?: unknown; version?: unknown };
    if (
      !current ||
      typeof data?.mutationId !== 'string' ||
      data.status !== 'applied' ||
      !Number.isInteger(data.version) ||
      Number(data.version) < 1 ||
      Number(data.version) > current.version
    )
      throw new Error('Restored timer receipt is invalid');
  }
  return {
    owners: currentByOwner.size,
    currents: currents.length,
    revisions: revisions.length,
    receipts: receipts.length,
  };
}
