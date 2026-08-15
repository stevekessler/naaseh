import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { log, metric } from '@naaseh/observability';
import { dynamodb, tableName } from '../shared/dynamodb.js';

type InventoryLocation =
  | 'task'
  | 'list'
  | 'completion'
  | 'workload'
  | 'stack'
  | 'pendingMutation'
  | 'backup'
  | 'other';
export interface InventoryRow {
  PK?: unknown;
  SK?: unknown;
  data?: unknown;
  count?: unknown;
  [key: string]: unknown;
}
export interface ExtraLowInventory {
  total: number;
  counts: Record<InventoryLocation, number>;
  scanned: number;
  allowed: boolean;
}

const EMPTY_COUNTS: Record<InventoryLocation, number> = {
  task: 0,
  list: 0,
  completion: 0,
  workload: 0,
  stack: 0,
  pendingMutation: 0,
  backup: 0,
  other: 0,
};
const containsExtraLow = (value: unknown): boolean => {
  if (typeof value === 'string' && value.toLocaleLowerCase().includes('extra_low')) return true;
  if (Array.isArray(value)) return value.some(containsExtraLow);
  return Boolean(
    value &&
      typeof value === 'object' &&
      Object.entries(value).some(
        ([key, child]) => key.toLocaleLowerCase().includes('extra_low') || containsExtraLow(child),
      ),
  );
};
const locationFor = (row: InventoryRow): InventoryLocation => {
  const pk = String(row.PK ?? '');
  const sk = String(row.SK ?? '');
  if (pk.startsWith('TASK#') && sk === 'CURRENT') return 'task';
  if (pk.startsWith('LIST#') && sk === 'CURRENT') return 'list';
  if (pk.startsWith('COMPLETION#')) return 'completion';
  if (pk.startsWith('WORKLOAD#')) return 'workload';
  if (pk.startsWith('STACK#')) return 'stack';
  if (sk.startsWith('MUTATION#') || sk.startsWith('TIMER#RECEIPT#')) return 'pendingMutation';
  if (pk.startsWith('BACKUP#') || sk === 'MANIFEST') return 'backup';
  return 'other';
};

export function inventoryExtraLowRows(rows: readonly InventoryRow[]): ExtraLowInventory {
  const counts = { ...EMPTY_COUNTS };
  for (const row of rows) {
    if (!containsExtraLow(row)) continue;
    counts[locationFor(row)] = Math.min(1_000_000, counts[locationFor(row)] + 1);
  }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return { total, counts, scanned: rows.length, allowed: total === 0 };
}

export function requireZeroExtraLow(inventory: ExtraLowInventory) {
  if (!inventory.allowed)
    throw new Error('Extra Low removal rollout blocked: persisted values require explicit review.');
  return inventory;
}

export async function handler() {
  const rows: InventoryRow[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const page = await dynamodb.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: 'PK, SK, #data, #count',
        ExpressionAttributeNames: { '#data': 'data', '#count': 'count' },
        ExclusiveStartKey: cursor,
      }),
    );
    rows.push(...((page.Items ?? []) as InventoryRow[]));
    cursor = page.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (cursor);
  const inventory = inventoryExtraLowRows(rows);
  metric('ExtraLowInventoryCount', inventory.total, 'Count');
  metric(inventory.allowed ? 'ExtraLowInventoryPassed' : 'ExtraLowInventoryBlocked', 1);
  log('extra_low.inventory', {
    outcome: inventory.allowed ? 'passed' : 'blocked',
    totalBucket: inventory.total === 0 ? 'zero' : inventory.total < 10 ? 'under_10' : 'ten_or_more',
    scannedBucket: inventory.scanned < 1_000 ? 'under_1k' : 'one_thousand_or_more',
  });
  return requireZeroExtraLow(inventory);
}
