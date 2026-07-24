import {
  createList,
  createListItem,
  deterministicCopyId,
  listTotal,
  moveListItem,
} from '@naaseh/domain';
import { describe, expect, it } from 'vitest';

function percentile(samples: number[], fraction: number) {
  return (
    [...samples].sort((left, right) => left - right)[Math.ceil(samples.length * fraction) - 1] ?? 0
  );
}

describe('large list performance', () => {
  it('renders data, reorders, totals, and derives attachment-copy identities for 1,000 items within local p95 targets', () => {
    const list = createList({ name: 'Warehouse' }, 'owner', new Date('2026-01-01T00:00:00Z'));
    const samples: number[] = [];
    for (let run = 0; run < 20; run += 1) {
      const started = performance.now();
      const items = Array.from({ length: 1_000 }, (_, index) =>
        createListItem(
          list.id,
          { name: `Item ${index}`, amountMinor: -100 + (index % 5) * 25 },
          'owner',
          String(index * 10).padStart(12, '0'),
          new Date(1_704_067_200_000 + index),
        ),
      );
      const moved = moveListItem(items[999]!, '000000000005');
      const total = listTotal(items);
      const attachmentIds = items
        .slice(0, 100)
        .map((item) => deterministicCopyId(list.id, `attachment:${item.id}`));
      expect(moved.orderKey).toBe('000000000005');
      expect(total).toBe(-50_000);
      expect(new Set(attachmentIds)).toHaveLength(100);
      samples.push(performance.now() - started);
    }
    const p50 = percentile(samples, 0.5);
    const p95 = percentile(samples, 0.95);
    console.info(JSON.stringify({ metric: 'large-list-and-copy', p50Ms: p50, p95Ms: p95 }));
    expect(p95).toBeLessThan(250);
  }, 10_000);
});
