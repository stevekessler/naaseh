import { describe, expect, it } from 'vitest';
import {
  inventoryExtraLowRows,
  requireZeroExtraLow,
} from '../../apps/api/src/projects/extra-low-inventory-handler.js';

describe('Extra Low removal guard', () => {
  it('reports bounded counts across persisted active locations without mutating rows', () => {
    const rows = Object.freeze([
      Object.freeze({ PK: 'TASK#1', SK: 'CURRENT', data: { urgency: 'extra_low' } }),
      Object.freeze({ PK: 'LIST#1', SK: 'CURRENT', data: { urgency: 'low' } }),
      Object.freeze({
        PK: 'COMPLETION#1',
        SK: 'EVENT',
        data: { urgencyAtCompletion: 'extra_low' },
      }),
      Object.freeze({ PK: 'WORKLOAD#OWNER#1', SK: 'COUNT#ALL#URGENCY#extra_low', count: 1 }),
      Object.freeze({ PK: 'STACK#USER#1#OVERALL', SK: 'SNAPSHOT#1', data: ['extra_low'] }),
      Object.freeze({ PK: 'BACKUP#1', SK: 'MANIFEST', data: { currentUrgency: 'extra_low' } }),
    ]);
    const result = inventoryExtraLowRows(rows);
    expect(result.total).toBe(5);
    expect(result.counts).toMatchObject({
      task: 1,
      completion: 1,
      workload: 1,
      stack: 1,
      backup: 1,
    });
    expect(() => requireZeroExtraLow(result)).toThrow(/blocked/iu);
    expect(rows[0]?.data.urgency).toBe('extra_low');
  });

  it('permits rollout only when every location is zero', () => {
    const result = inventoryExtraLowRows([
      { PK: 'TASK#1', SK: 'CURRENT', data: { urgency: 'low' } },
    ]);
    expect(requireZeroExtraLow(result)).toEqual(result);
  });
});
