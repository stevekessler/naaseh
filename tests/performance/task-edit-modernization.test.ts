import { describe, expect, it } from 'vitest';
import { applyFilteredPermutation, memoDocumentText, normalizeMemoDocument } from '@naaseh/domain';
import { filterReferenceOptions } from '../../apps/web/src/components/reference-options.js';

describe('reference combobox performance', () => {
  it('bounds 1,000 matching choices to 50 results', () => {
    const options = Array.from({ length: 1_000 }, (_, index) => ({
      id: String(index),
      label: `Task ${index}`,
    }));
    const started = performance.now();
    expect(filterReferenceOptions(options, 'task')).toHaveLength(50);
    expect(performance.now() - started).toBeLessThan(200);
  });

  it('projects maximum memo feedback within 100 milliseconds', () => {
    const input = {
      version: 1 as const,
      blocks: [
        {
          type: 'paragraph' as const,
          runs: [{ text: 'x'.repeat(20_000), marks: ['bold' as const] }],
        },
      ],
    };
    const started = performance.now();
    const document = normalizeMemoDocument(input);
    expect(memoDocumentText(document)).toHaveLength(20_000);
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('applies local filtered rank feedback within 200 milliseconds', () => {
    const order = Array.from({ length: 1_000 }, (_, index) => ({
      workType: 'task' as const,
      workId: `task-${index}`,
      membershipEpoch: `epoch-${index}`,
    }));
    const affectedWork = order.filter((_, index) => index % 2 === 0);
    const started = performance.now();
    const result = applyFilteredPermutation(order, {
      movedWork: affectedWork[400]!,
      affectedWork,
      destinationIndex: 10,
    });
    expect(result).toHaveLength(1_000);
    expect(performance.now() - started).toBeLessThan(200);
  });
});
